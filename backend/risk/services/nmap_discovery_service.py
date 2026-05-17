import paramiko
import re
from django.utils import timezone
from risk.models import Asset
from integrations.models import IntegrationConfig

class NmapDiscoveryService:
    def __init__(self, username=None, password=None):
        self.host = None
        self.username = username
        self.password = password
        
        try:
            config = IntegrationConfig.objects.get(provider='nmap', is_active=True)
            self.host = config.api_url # No Nmap, usamos o campo api_url para o Host SSH
            self.username = self.username or config.username
            self.password = self.password or config.password
        except IntegrationConfig.DoesNotExist:
            # Fallback para o host do Wazuh se o Nmap não estiver configurado explicitamente
            try:
                wazuh_config = IntegrationConfig.objects.get(provider='wazuh', is_active=True)
                if wazuh_config.api_url:
                    self.host = wazuh_config.api_url.split("//")[-1].split(":")[0]
            except IntegrationConfig.DoesNotExist:
                pass

    def run_all_networks_scan(self):
        from risk.models import NetworkRange
        import xml.etree.ElementTree as ET
        
        if not self.host or not self.username or not self.password:
            raise Exception("Configuração Nmap/SSH incompleta (Host, Utilizador ou Password em falta).")

        networks = NetworkRange.objects.filter(is_active=True)
        if not networks.exists():
            raise Exception("Nenhuma rede organizacional definida para scan. Adicione redes no menu de Configurações.")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        discovered_hosts = [] # List of dicts: {ip, hostname, services}
        
        try:
            ssh.connect(self.host, username=self.username, password=self.password)
            
            for net in networks:
                # -sn: Ping scan - disable port scan (FAST)
                # -oX -: XML output to stdout
                command = f"nmap -sn -oX - {net.cidr}"
                stdin, stdout, stderr = ssh.exec_command(command, timeout=300)
                
                xml_output = stdout.read().decode('utf-8')
                if xml_output.strip():
                    discovered_hosts.extend(self._parse_nmap_xml(xml_output))
                
            return discovered_hosts
            
        finally:
            ssh.close()

    def enrich_single_host(self, ip):
        """
        Executa scan detalhado para um único IP com deteção de vulnerabilidades.
        """
        if not self.host or not self.username or not self.password:
            raise Exception("Configuração SSH incompleta.")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            ssh.connect(self.host, username=self.username, password=self.password)
            
            # -sV: Versões, -O: SO, --script vulners: Deteção de vulnerabilidades
            command = f"sudo nmap -sV -O --script vulners --osscan-limit --osscan-guess -oX - {ip}"
            stdin, stdout, stderr = ssh.exec_command(command, timeout=300) # Vulnerabilidades levam mais tempo
            
            xml_output = stdout.read().decode('utf-8')
            error_output = stderr.read().decode('utf-8')

            if "sudo: a password is required" in error_output.lower():
                command_alt = f"nmap -sV --script vulners -oX - {ip}"
                stdin, stdout, stderr = ssh.exec_command(command_alt, timeout=300)
                xml_output = stdout.read().decode('utf-8')

            hosts = self._parse_nmap_xml(xml_output)
            return hosts[0] if hosts else None
            
        finally:
            ssh.close()

    def _parse_nmap_xml(self, xml_content):
        import xml.etree.ElementTree as ET
        hosts = []
        try:
            root = ET.fromstring(xml_content)
            for host_node in root.findall('host'):
                status = host_node.find('status')
                if status is not None and status.get('state') == 'up':
                    host_info = {
                        "ip": None,
                        "hostname": "",
                        "os_name": "Unknown",
                        "services": [],
                        "vulnerabilities": [], # New field for CVEs
                        "detected_software": [] # New field for Software Inventory
                    }
                    
                    addr = host_node.find("address[@addrtype='ipv4']")
                    if addr is not None:
                        host_info["ip"] = addr.get('addr')
                    
                    hostnames = host_node.find('hostnames')
                    if hostnames is not None:
                        name_node = hostnames.find('hostname')
                        if name_node is not None:
                            host_info["hostname"] = name_node.get('name')

                    os_node = host_node.find('os')
                    if os_node is not None:
                        os_match = os_node.find('osmatch')
                        if os_match is not None:
                            host_info["os_name"] = os_match.get('name')
                        elif os_node.find('osclass') is not None:
                            host_info["os_name"] = os_node.find('osclass').get('osfamily')
                    
                    ports = host_node.find('ports')
                    if ports is not None:
                        for port in ports.findall('port'):
                            port_id = port.get('portid')
                            protocol = port.get('protocol')
                            service_node = port.find('service')
                            
                            service_data = {
                                "id": port_id,
                                "protocol": protocol,
                                "name": "unknown",
                                "product": "",
                                "version": "",
                                "extrainfo": ""
                            }
                            
                            if service_node is not None:
                                service_data["name"] = service_node.get('name', 'unknown')
                                service_data["product"] = service_node.get('product', '')
                                service_data["version"] = service_node.get('version', '')
                                service_data["extrainfo"] = service_node.get('extrainfo', '')
                                
                                details = [service_data["name"]]
                                if service_data["product"]:
                                    service_detail = service_data["product"]
                                    if service_data["version"]:
                                        service_detail += f" {service_data['version']}"
                                    if service_data["extrainfo"]:
                                        service_detail += f" ({service_data['extrainfo']})"
                                    details.append(service_detail)
                                
                                display_name = " - ".join(details) if len(details) > 1 else details[0]
                            else:
                                display_name = "unknown"

                            state_node = port.find('state')
                            state = state_node.get('state') if state_node is not None else "unknown"
                            
                            if state == 'open':
                                host_info["services"].append(f"{port_id}/{protocol} ({display_name})")
                                
                                # Add to software inventory if it looks like real software
                                if service_data["product"] or service_data["name"] != "unknown":
                                    host_info["detected_software"].append({
                                        "name": service_data["product"] or service_data["name"],
                                        "version": service_data["version"] or "unknown",
                                        "vendor": service_data.get("product", ""),
                                    })

                            # Parse scripts (Vulnerabilities)
                            for script in port.findall('script'):
                                if script.get('id') == 'vulners':
                                    # O vulners retorna tabelas aninhadas
                                    for table in script.findall('table'):
                                        for cpe_table in table.findall('table'):
                                            for vuln_table in cpe_table.findall('table'):
                                                vuln = {}
                                                for elem in vuln_table.findall('elem'):
                                                    key = elem.get('key')
                                                    if key in ['id', 'cvss', 'type']:
                                                        vuln[key] = elem.text
                                                
                                                if vuln.get('id') and vuln.get('cvss'):
                                                    host_info["vulnerabilities"].append({
                                                        "cve_id": vuln['id'],
                                                        "cvss": float(vuln['cvss']),
                                                        "port": port_id,
                                                        "service": service_data["product"] or service_data["name"],
                                                        "version": service_data["version"]
                                                    })
                    
                    if host_info["ip"]:
                        hosts.append(host_info)

        except Exception as e:
            print(f"Error parsing Nmap XML: {e}")
            
        return hosts

    def match_and_create_assets(self, found_hosts):
        stats = {"created": 0, "ignored": 0}
        
        for host in found_hosts:
            ip = host["ip"]
            hostname = host["hostname"]
            os_name = host["os_name"]
            services = ", ".join(host["services"])
            
            # Verifica se já existe um ativo com este IP
            existing_asset = Asset.objects.filter(wazuh_ip=ip).first()
            if existing_asset:
                existing_asset.last_sync_at = timezone.now()
                existing_asset.save()
                stats["ignored"] += 1
                continue
                
            # Define o nome (Hostname se existir, senão o formato IP)
            asset_name = hostname if hostname else f"Nmap-Host-{ip.replace('.', '-')}"
            
            description = f"[NMAP ENRICHED] Ativo detetado via scan ativo.\n"
            if hostname:
                description += f"Hostname: {hostname}\n"
            if os_name and os_name != "Unknown":
                description += f"Sistema Operativo: {os_name}\n"
            if services:
                description += f"Serviços Abertos: {services}"
            else:
                description += "Nenhum serviço comum aberto detetado."

            # Cria novo ativo na aba de descobertas
            Asset.objects.create(
                name=asset_name,
                asset_type="Infrastructure",
                criticality="Medium",
                source="discovery",
                wazuh_ip=ip,
                wazuh_os_name=os_name if os_name != "Unknown" else None,
                last_sync_at=timezone.now(),
                description=description,
                status="Active"
            )
            stats["created"] += 1
            
        return stats

    def purge_missing_assets(self, found_ips):
        """
        Remove ativos de 'discovery' que não foram encontrados no scan atual.
        """
        to_delete = Asset.objects.filter(source='discovery').exclude(wazuh_ip__in=found_ips)
        count = to_delete.count()
        to_delete.delete()
        return count

    def cleanup_ghost_assets(self):
        """
        Remove ativos de 'discovery' que não têm serviços nem hostname (lixo de scans anteriores).
        """
        ghosts = Asset.objects.filter(
            source='discovery',
            description__icontains="Nenhum serviço comum aberto detetado."
        ).exclude(name__contains=".") # Geralmente hostnames resolvidos têm pontos ou não seguem o padrão Nmap-Host-IP

        # Refinar: se o nome começar por Nmap-Host e a descrição disser que não há serviços, é fantasma
        count = 0
        for asset in ghosts:
            if asset.name.startswith("Nmap-Host-"):
                asset.delete()
                count += 1
        return count


