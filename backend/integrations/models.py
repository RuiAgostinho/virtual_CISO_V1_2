from django.db import models

from django.utils.translation import gettext_lazy as _



class IntegrationConfig(models.Model):

    PROVIDER_CHOICES = [

        ('wazuh', 'Wazuh'),

        ('epss', 'FIRST EPSS'),

        ('nist', 'NIST NVD'),

        ('kev', 'CISA KEV'),

        ('nmap', 'Nmap Discovery (SSH)'),

    ]



    provider = models.CharField(

        max_length=50, 

        choices=PROVIDER_CHOICES, 

        unique=True,

        help_text=_("The name of the external service provider.")

    )

    api_url = models.CharField(

        max_length=255, 

        blank=True, 

        null=True,

        help_text=_("The base URL or Hostname for the API (e.g. Manager API).")

    )

    indexer_url = models.CharField(

        max_length=255, 

        blank=True, 

        null=True,

        help_text=_("The base URL or Hostname for the Wazuh Indexer.")

    )

    indexer_username = models.CharField(

        max_length=255, 

        blank=True, 

        null=True,

        help_text=_("The username for the Wazuh Indexer.")

    )

    indexer_password = models.CharField(

        max_length=255, 

        blank=True, 

        null=True,

        help_text=_("The password for the Wazuh Indexer.")

    )

    username = models.CharField(

        max_length=255, 

        blank=True, 

        null=True,

        help_text=_("Username for API authentication.")

    )

    password = models.CharField(

        max_length=255, 

        blank=True, 

        null=True,

        help_text=_("Password or token for API authentication.")

    )

    is_active = models.BooleanField(

        default=True,

        help_text=_("Whether this integration is currently active.")

    )

    

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)



    def __str__(self):

        return f"{self.get_provider_display()} Configuration"



    class Meta:

        verbose_name = "Integration Configuration"

        verbose_name_plural = "Integration Configurations"



class IntegrationSyncStatus(models.Model):

    provider = models.CharField(max_length=50)

    sync_type = models.CharField(max_length=50)  # e.g., 'assets', 'vulns'

    status = models.CharField(max_length=20, default='PENDING')  # 'RUNNING', 'SUCCESS', 'FAILED'

    last_run_at = models.DateTimeField(auto_now=True)

    last_error = models.TextField(blank=True, null=True)

    duration_seconds = models.IntegerField(default=0)



    class Meta:

        unique_together = ('provider', 'sync_type')

        verbose_name = "Integration Sync Status"

        verbose_name_plural = "Integration Sync Statuses"

        

    def __str__(self):

        return f"{self.provider} - {self.sync_type} ({self.status})"





