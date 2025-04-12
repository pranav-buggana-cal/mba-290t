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
            console.log('API URL:', API_CONFIG.BASE_URL);

            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            console.log('Making fetch request to:', `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH}`);

            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
            });

            console.log('Response status:', response.status);

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