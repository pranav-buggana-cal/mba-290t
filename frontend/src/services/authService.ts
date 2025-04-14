import { API_CONFIG } from '../config/api';

interface LoginResponse {
    access_token: string;
    token_type: string;
}

class AuthService {
    private static TOKEN_KEY = 'auth_token';

    static async login(username: string, password: string): Promise<boolean> {
        try {
            console.log('Login attempt with username:', username);

            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            // Determine whether to use the proxy URL
            const useProxy = !!API_CONFIG.PROXY_URL;
            const baseUrl = useProxy ? API_CONFIG.PROXY_URL : API_CONFIG.BASE_URL;

            // Build the URL - use the normal token endpoint
            const url = `${baseUrl}${API_CONFIG.ENDPOINTS.AUTH}`;
            console.log(`Making fetch request to: ${url} (using proxy: ${useProxy})`);
            console.log('Request content-type:', 'application/x-www-form-urlencoded');
            console.log('Request body (URL encoded):', formData.toString());

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
                mode: 'cors',
                // Set longer timeout for fetch
                signal: AbortSignal.timeout(30000) // 30 seconds timeout
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', [...response.headers.entries()]);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Login failed with response:', errorText);
                throw new Error(`Login failed: ${errorText}`);
            }

            const data: LoginResponse = await response.json();
            console.log('Login successful, token received');
            localStorage.setItem(AuthService.TOKEN_KEY, data.access_token);
            return true;
        } catch (error) {
            console.error('Login error:', error);

            // If it looks like a CORS error, provide a clearer message
            if (error instanceof Error && error.message.includes('Failed to fetch')) {
                console.error('This appears to be a CORS issue. Try these solutions:');
                console.error('1. Install a CORS browser extension (for development only)');
                console.error('2. Configure the backend to allow requests from this origin');
                console.error('3. Use a server-side proxy instead of client-side requests');
            }

            return false;
        }
    }

    static logout(): void {
        localStorage.removeItem(AuthService.TOKEN_KEY);
    }

    static getToken(): string | null {
        return localStorage.getItem(AuthService.TOKEN_KEY);
    }

    static isAuthenticated(): boolean {
        return !!this.getToken();
    }

    static getAuthHeaders(): HeadersInit {
        const token = this.getToken();
        return token ? {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        } : {
            'Content-Type': 'application/json',
        };
    }
}

export default AuthService; 