from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        raw_token = request.COOKIES.get("access")
        if not raw_token:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
        except (InvalidToken, TokenError):
            # A stale/expired access cookie must not hard-fail the request.
            # Returning None treats the request as anonymous, so AllowAny
            # endpoints (login, logout, csrf) stay usable and the user can
            # re-authenticate. IsAuthenticated views still return 401 because
            # request.user remains anonymous.
            return None

        user = self.get_user(validated_token)
        return (user, validated_token)