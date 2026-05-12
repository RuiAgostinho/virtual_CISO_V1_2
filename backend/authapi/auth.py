from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import exceptions


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get("access")
        if not raw_token:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)
        return (user, validated_token)