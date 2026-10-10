from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError
from oauth2_provider.models import Application


class Command(BaseCommand):
    help = "Register a public PKCE OAuth client with exact ChatGPT callback URLs."

    def add_arguments(self, parser):
        parser.add_argument("--redirect-uri", action="append", required=True)
        parser.add_argument("--client-id", default="notoli-chatgpt")
        parser.add_argument("--name", default="Notoli for ChatGPT")

    def handle(self, *args, **options):
        for uri in options["redirect_uri"]:
            parsed = urlsplit(uri)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.fragment
                or "*" in uri
            ):
                raise CommandError(
                    "Each callback must be an exact HTTPS URL without credentials, fragments, or wildcards."
                )
        if Application.objects.filter(client_id=options["client_id"]).exists():
            raise CommandError(
                "Client already exists. Review callback changes explicitly in Django admin; existing registrations were not changed."
            )
        app = Application(
            client_id=options["client_id"],
            **{
                "name": options["name"],
                "client_type": Application.CLIENT_PUBLIC,
                "authorization_grant_type": Application.GRANT_AUTHORIZATION_CODE,
                "redirect_uris": " ".join(options["redirect_uri"]),
                "skip_authorization": False,
            },
        )
        app.full_clean()
        app.save()
        self.stdout.write(
            f"Client ID: {app.client_id}\nAuthentication method: none (public client with S256 PKCE). No client secret is needed."
        )
