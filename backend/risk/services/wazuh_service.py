import os

import requests

import urllib3

from integrations.models import IntegrationConfig



# Suppress insecure request warnings if Wazuh uses self-signed certs

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)



class WazuhService:

    def __init__(self):

        try:

            config = IntegrationConfig.objects.get(provider='wazuh', is_active=True)

            self.api_url = config.api_url or "https://localhost:55000"

            self.indexer_url = config.indexer_url # This might be None

            self.api_user = config.username or "wazuh-wui"

            self.api_password = config.password or "wazuh-wui"

            self.indexer_user = config.indexer_username or self.api_user

            self.indexer_password = config.indexer_password or self.api_password

        except IntegrationConfig.DoesNotExist:

            self.api_url = "https://localhost:55000"

            self.indexer_url = None

            self.api_user = "wazuh-wui"

            self.api_password = "wazuh-wui"

            self.indexer_user = "wazuh-wui"

            self.indexer_password = "wazuh-wui"

        

        # Heuristic for Indexer (Port 9200) fallback if not configured

        if not self.indexer_url:

            self.indexer_url = self.api_url.replace(":55000", ":9200")

            

        self.token = None

        self._indexer_status_checked = False

        self._indexer_active = True



    def authenticate(self):

        url = f"{self.api_url}/security/user/authenticate"

        try:

            response = requests.get(

                url, 

                auth=(self.api_user, self.api_password), 

                verify=False,

                timeout=5

            )

            response.raise_for_status()

            data = response.json()

            self.token = data.get('data', {}).get('token')

            if not self.token:

                raise Exception("Token received is empty")

            return self.token

        except Exception as e:

            raise Exception(f"Erro na autenticação Wazuh: {str(e)}")



    def get_agents(self):

        if not self.token:

            self.authenticate()

        

        url = f"{self.api_url}/agents"

        headers = {

            'Authorization': f'Bearer {self.token}'

        }

        try:

            response = requests.get(url, headers=headers, verify=False, timeout=5)

            response.raise_for_status()

            data = response.json()

            return data.get('data', {}).get('affected_items', [])

        except Exception as e:

            raise Exception(f"Erro ao obter agentes Wazuh: {str(e)}")



    def get_agent_hardware(self, agent_id):

        if not self.token:

            self.authenticate()

            

        url = f"{self.api_url}/syscollector/{agent_id}/hardware"

        headers = {

            'Authorization': f'Bearer {self.token}'

        }

        try:

            response = requests.get(url, headers=headers, verify=False, timeout=5)

            if response.status_code == 400:

                return {}

            response.raise_for_status()

            data = response.json()

            items = data.get('data', {}).get('affected_items', [])

            return items[0] if items else {}

        except Exception as e:

            print(f"Erro ao obter hardware do agente {agent_id}: {e}")

            return {}



    def get_agent_packages(self, agent_id, limit=500):

        if not self.token:

            self.authenticate()

            

        url = f"{self.api_url}/syscollector/{agent_id}/packages?limit={limit}"

        headers = {

            'Authorization': f'Bearer {self.token}'

        }

        try:

            response = requests.get(url, headers=headers, verify=False, timeout=5)

            if response.status_code == 400:

                return []

            response.raise_for_status()

            data = response.json()

            return data.get('data', {}).get('affected_items', [])

        except Exception as e:

            print(f"Erro ao obter pacotes do agente {agent_id}: {e}")

            return []



    def get_vulnerabilities(self, agent_id=None):

        # Circuit breaker if indexer failed previously in this service instance

        if not self._indexer_active:

            return []



        try:

            indexer_search_url = f"{self.indexer_url}/wazuh-states-vulnerabilities-*/_search"

            query = {

                "size": 1000,

                "query": {

                    "bool": {

                        "must": []

                    }

                }

            }

            if agent_id:

                query["query"]["bool"]["must"].append({"match_phrase": {"agent.id": agent_id}})



            response = requests.get(

                indexer_search_url,

                auth=(self.indexer_user, self.indexer_password),

                json=query,

                verify=False,

                timeout=3 # Shorter timeout for Indexer

            )

            if response.status_code == 200:

                self._indexer_active = True

                hits = response.json().get('hits', {}).get('hits', [])

                print(f"Indexer query successful for {agent_id or 'all'}. Hits: {len(hits)}")

                return [h['_source'] for h in hits]

            else:

                print(f"Indexer returned status {response.status_code}: {response.text}")

        except requests.exceptions.ConnectionError:

            if not self._indexer_status_checked:

                print(f"Indexer connection refused at {self.indexer_url}. Skipping Indexer queries for this session.")

                self._indexer_status_checked = True

            self._indexer_active = False

        except Exception as e:

            if not self._indexer_status_checked:

                print(f"Indexer check failed: {e}")

                self._indexer_status_checked = True

            self._indexer_active = False



        # Fallback to Manager API

        if not self.token:

            try:

                self.authenticate()

            except:

                return []



        url = f"{self.api_url}/vulnerability/{agent_id}" if agent_id else f"{self.api_url}/vulnerability/summary"

        headers = {'Authorization': f'Bearer {self.token}'}

        try:

            response = requests.get(url, headers=headers, verify=False, timeout=5)

            if response.status_code == 200:

                return response.json().get('data', {}).get('affected_items', [])

        except Exception:

            pass

            

        return []



    def get_recent_alerts(self, limit=100, min_level=12):

        """

        Queries the Wazuh Indexer for recent high-severity alerts.

        """

        if not self._indexer_active:

            return []



        try:

            indexer_search_url = f"{self.indexer_url}/wazuh-alerts-*/_search"

            

            # Query for alerts with level >= min_level, sorted by timestamp descending

            query = {

                "size": limit,

                "sort": [{"timestamp": {"order": "desc"}}],

                "query": {

                    "bool": {

                        "must": [

                            {"range": {"rule.level": {"gte": min_level}}}

                        ]

                    }

                }

            }



            response = requests.get(

                indexer_search_url,

                auth=(self.indexer_user, self.indexer_password),

                json=query,

                verify=False,

                timeout=5

            )

            

            if response.status_code == 200:

                hits = response.json().get('hits', {}).get('hits', [])

                return [h['_source'] for h in hits]

            else:

                print(f"Failed to fetch Wazuh alerts. Status: {response.status_code}")

                return []

                

        except Exception as e:

            print(f"Error fetching Wazuh alerts from indexer: {e}")

            return []





