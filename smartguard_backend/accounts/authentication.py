from rest_framework_simplejwt.authentication import JWTAuthentication

class QueryParameterTokenAuthentication(JWTAuthentication):
    """
    Allows authentication via a 'token' query parameter in the URL.
    This is necessary for browser-initiated downloads (<a href>) and video streaming (<video src>),
    which cannot easily include the 'Authorization' header.
    """
    def authenticate(self, request):
        # First, try standard JWTAuthentication (header)
        auth = super().authenticate(request)
        if auth is not None:
            return auth
            
        # If no header, check query parameters
        token = request.query_params.get('token')
        if not token:
            return None
            
        try:
            validated_token = self.get_validated_token(token)
            return self.get_user(validated_token), validated_token
        except Exception as e:
            from rest_framework.exceptions import AuthenticationFailed
            raise AuthenticationFailed(str(e))
