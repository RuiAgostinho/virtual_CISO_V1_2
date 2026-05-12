from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()

class UserOut(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "username", "first_name", "last_name")

class LoginIn(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()