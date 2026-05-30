from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from integrations.models import IntegrationSyncStatus
from risk.models import Asset, Software
from risk.services.wazuh_service import WazuhService


def _get_path(data, path, default=None):
    current = data
    for part in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(part)
        if current is None:
            return default
    return current


def _first(data, *paths):
    for path in paths:
        value = _get_path(data, path)
        if value not in (None, "", [], {}):
            return value
    return None


def _parse_datetime(value):
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value
    parsed = parse_datetime(str(value))
    return parsed


def _agent_ip(agent):
    value = _first(agent, "ip", "registerIP", "lastIP")
    if isinstance(value, list):
        value = next((item for item in value if item), None)
    if not value or str(value).lower() in {"any", "0.0.0.0"}:
        return None
    return str(value)


def _agent_name(agent):
    agent_id = str(agent.get("id") or "").strip()
    return str(agent.get("name") or agent.get("hostname") or f"Wazuh agent {agent_id}").strip()


def _sync_packages(service, asset, agent_id):
    packages = service.get_agent_packages(agent_id)
    asset.wazuh_packages = packages
    linked = 0
    for package in packages:
        name = package.get("name")
        if not name:
            continue
        software, _created = Software.objects.get_or_create(
            name=str(name).strip(),
            version=str(package.get("version") or "").strip() or None,
            vendor=str(package.get("vendor") or "").strip() or None,
            defaults={
                "architecture": str(package.get("architecture") or "").strip() or None,
                "source": "wazuh",
                "status": "New",
            },
        )
        software.assets.add(asset)
        linked += 1
    return linked


class Command(BaseCommand):
    help = "Synchronize Wazuh agents into asset onboarding records."

    def add_arguments(self, parser):
        parser.add_argument("--skip-packages", action="store_true", help="Do not import syscollector packages.")

    def handle(self, *args, **options):
        started_at = timezone.now()
        sync, _created = IntegrationSyncStatus.objects.get_or_create(provider="wazuh", sync_type="assets")
        sync.status = "RUNNING"
        sync.last_error = ""
        sync.save(update_fields=["status", "last_error", "last_run_at"])

        created_count = 0
        updated_count = 0
        packages_count = 0

        try:
            service = WazuhService()
            agents = service.get_agents()
            for agent in agents:
                agent_id = str(agent.get("id") or "").strip()
                if not agent_id:
                    continue

                ip_address = _agent_ip(agent)
                asset = Asset.objects.filter(wazuh_agent_id=agent_id).first()
                if not asset and ip_address:
                    asset = Asset.objects.filter(wazuh_ip=ip_address).first()

                if asset:
                    created = False
                else:
                    created = True
                    asset = Asset(
                        source="wazuh",
                        status="New",
                        wazuh_agent_id=agent_id,
                    )

                os_info = agent.get("os") or {}
                asset.name = _agent_name(agent)
                asset.source = asset.source or "wazuh"
                asset.wazuh_agent_id = agent_id
                asset.wazuh_ip = ip_address or asset.wazuh_ip
                asset.wazuh_node_name = str(agent.get("node_name") or agent.get("node") or "").strip() or None
                asset.wazuh_os_name = str(os_info.get("name") or agent.get("os_name") or "").strip() or asset.wazuh_os_name
                asset.wazuh_os_version = str(os_info.get("version") or agent.get("os_version") or "").strip() or asset.wazuh_os_version
                asset.wazuh_last_seen = _parse_datetime(agent.get("lastKeepAlive") or agent.get("last_seen"))
                asset.last_sync_at = timezone.now()
                asset.wazuh_hardware = service.get_agent_hardware(agent_id)
                if created:
                    asset.status = "New"
                asset.save()

                if not options["skip_packages"]:
                    packages_count += _sync_packages(service, asset, agent_id)
                    asset.save(update_fields=["wazuh_packages", "updated_at"])

                if created:
                    created_count += 1
                else:
                    updated_count += 1

            sync.status = "SUCCESS"
            sync.duration_seconds = int((timezone.now() - started_at).total_seconds())
            sync.last_error = ""
            sync.save(update_fields=["status", "duration_seconds", "last_error", "last_run_at"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"Wazuh assets synchronized: {created_count} created, {updated_count} updated, {packages_count} packages linked."
                )
            )
        except Exception as exc:
            sync.status = "FAILED"
            sync.duration_seconds = int((timezone.now() - started_at).total_seconds())
            sync.last_error = str(exc)
            sync.save(update_fields=["status", "duration_seconds", "last_error", "last_run_at"])
            raise
