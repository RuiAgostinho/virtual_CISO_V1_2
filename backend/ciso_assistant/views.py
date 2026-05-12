from rest_framework.views import APIView

from rest_framework.response import Response

from rest_framework import status

from .serializers import ChatRequestSerializer, ChatResponseSerializer

from .services.chat.chat_service import ChatService



class AskCISOView(APIView):

    """

    Endpoint para realizar perguntas ao Virtual CISO.

    Utiliza um sistema RAG hÃ­brido integrado com o modelo local Ollama.

    """

    

    def post(self, request):

        serializer = ChatRequestSerializer(data=request.data)

        if not serializer.is_valid():

            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            

        user_query = serializer.validated_data['query']

        history = serializer.validated_data.get('history', [])

        filters = request.data.get('filters', {}) # Optional filters from frontend

        

        # Chama o serviÃ§o hÃ­brido

        result = ChatService.ask_ciso(user_query, history=history, filters=filters)

        

        resp_serializer = ChatResponseSerializer(data=result)

        resp_serializer.is_valid(raise_exception=True)

        

        return Response(resp_serializer.data, status=status.HTTP_200_OK)



