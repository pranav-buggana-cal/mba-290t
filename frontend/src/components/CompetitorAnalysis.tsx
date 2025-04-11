import { useState } from 'react';
import axios from 'axios';
import AuthService from '../services/authService';

const BACKEND_URL = 'http://localhost:8000';

export default function CompetitorAnalysis() {
  const [query, setQuery] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    document_path: string;
    summary: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await axios.post(`${BACKEND_URL}/analyze-competitors`, null, {
        params: { query: query.trim() },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('Response:', response.data);
      setResult(response.data);
    } catch (error: any) {
      console.error('Error:', error);
      setError(error.response?.data?.detail || 'Failed to generate analysis. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = (downloadPath: string) => {
    // Open in new tab using the backend URL
    window.open(`${BACKEND_URL}${downloadPath}`, '_blank');
  };

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Analyze Competitors</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>Enter your query to generate competitor analysis</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-5">
          <div>
            <label htmlFor="query" className="block text-sm font-medium text-gray-700">
              Analysis Query
            </label>
            <div className="mt-1">
              <textarea
                id="query"
                rows={4}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="e.g., Analyze the competitive landscape and identify key market opportunities..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-5">
            <button
              type="submit"
              disabled={!query.trim() || analyzing}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
                ${!query.trim() || analyzing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
            >
              {analyzing ? 'Analyzing...' : 'Generate Analysis'}
            </button>
          </div>
        </form>
        {error && (
          <div className="mt-4 p-4 rounded-md bg-red-50 text-red-700">
            {error}
          </div>
        )}
        {result && (
          <div className="mt-6">
            <h4 className="text-lg font-medium text-gray-900">Analysis Results</h4>
            <div className="mt-4 p-4 rounded-md bg-gray-50">
              <p className="text-sm text-gray-500">{result.summary}</p>
              <div className="mt-4">
                <button
                  onClick={() => handleDownload(result.document_path)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Download Full Analysis
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 