import { useState, useEffect } from 'react';
import axios from 'axios';
import AuthService from '../services/authService';
import { API_CONFIG, getApiUrl } from '../config/api';
import { useDocumentContext } from '../context/DocumentContext';

export default function CompetitorAnalysis() {
  const [query, setQuery] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    message: string;
    document_path: string;
    summary: string;
    analysis: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseLength, setResponseLength] = useState<number | null>(null);

  // Use document context to check if files are available
  const { hasCompetitorFiles, hasBusinessFiles } = useDocumentContext();

  // Button should be disabled if any required files are missing
  const canGenerateAnalysis = !!query.trim() && !analyzing && hasCompetitorFiles && hasBusinessFiles;

  // Update response length when result changes
  useEffect(() => {
    if (result && result.analysis) {
      setResponseLength(result.analysis.length);
      console.log('Updated response length:', result.analysis.length);
    }
  }, [result]);

  // Function to format the analysis text with proper styling
  const formatAnalysisText = (text: string) => {
    if (!text) return '';

    // Log the raw analysis to debug truncation issues
    console.log('Raw analysis length:', text.length);

    let formattedText = text;

    // Fix any potential JSON escaping issues
    try {
      if (typeof formattedText === 'string' &&
        (formattedText.startsWith('"') && formattedText.endsWith('"'))) {
        // Try to handle double-encoded JSON strings
        const unescaped = JSON.parse(formattedText);
        if (typeof unescaped === 'string') {
          console.log('Unescaped JSON string');
          formattedText = unescaped;
        }
      }
    } catch (e) {
      console.log('Not a JSON-encoded string, continuing with original text');
    }

    // Process markdown headings (#, ##, ###)
    formattedText = formattedText
      // h1 headings - match at start of line or after a newline
      .replace(/(\n|^)# (.+)($|\n)/gm, '$1<h1>$2</h1>$3')
      // h2 headings
      .replace(/(\n|^)## (.+)($|\n)/gm, '$1<h2>$2</h2>$3')
      // h3 headings
      .replace(/(\n|^)### (.+)($|\n)/gm, '$1<h3>$2</h3>$3')
      // h4 headings
      .replace(/(\n|^)#### (.+)($|\n)/gm, '$1<h4>$2</h4>$3');

    // Replace **text** with <strong>text</strong> for bold formatting
    formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Replace newlines with <br /> tags (after handling headings)
    formattedText = formattedText.replace(/\n/g, '<br />');

    // Log the formatted content for debugging
    console.log("Formatted analysis content length:", formattedText.length);

    return formattedText;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure all requirements are met
    if (!canGenerateAnalysis) {
      if (!hasCompetitorFiles || !hasBusinessFiles) {
        setError('Please upload both competitor and business documents before generating analysis');
      }
      return;
    }

    setAnalyzing(true);
    setError(null);
    setResult(null);
    setResponseLength(null);

    try {
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      console.log('Submitting query:', query.trim());

      // Use axios with maximum response size and specific transformResponse
      const response = await axios.post(getApiUrl(API_CONFIG.ENDPOINTS.ANALYZE), null, {
        params: { query: query.trim() },
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        responseType: 'json',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        transformResponse: [(data) => {
          // Ensure data is properly parsed without size limits
          if (typeof data === 'string') {
            try {
              return JSON.parse(data);
            } catch (e) {
              console.error('Error parsing response:', e);
              return data;
            }
          }
          return data;
        }]
      });

      console.log('Response status:', response.status);
      console.log('Response data type:', typeof response.data);

      // Log the full response for debugging
      if (response.data) {
        console.log('Has analysis:', !!response.data.analysis);
        if (response.data.analysis) {
          console.log('Analysis length:', response.data.analysis.length);
          console.log('Analysis preview:', response.data.analysis.substring(0, 100) + '...');
        }
      }

      setResult(response.data);
    } catch (error: any) {
      console.error('Error:', error);
      setError(error.response?.data?.detail || 'Failed to generate analysis. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async (downloadPath: string) => {
    try {
      const token = AuthService.getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await axios.get(getApiUrl(downloadPath), {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        responseType: 'blob'
      });

      // Create a blob URL and trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', downloadPath.split('/').pop() || 'analysis.docx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download error:', error);
      setError(error.response?.data?.detail || 'Failed to download analysis. Please try again.');
    }
  };

  // Generate a message about the document upload status
  const getDocumentStatusMessage = () => {
    if (!hasCompetitorFiles && !hasBusinessFiles) {
      return "Please upload both competitor and business documents before generating analysis.";
    } else if (!hasCompetitorFiles) {
      return "Please upload competitor documents before generating analysis.";
    } else if (!hasBusinessFiles) {
      return "Please upload business documents before generating analysis.";
    }
    return null;
  };

  const documentStatusMessage = getDocumentStatusMessage();

  return (
    <section className="analysis-section">
      <div className="analysis-container">
        <h3 className="analysis-title">Generate Competitive Analysis</h3>
        <div className="analysis-description">
          <p>Enter a brief description of your business to generate comprehensive competitor analysis</p>
        </div>

        <form onSubmit={handleSubmit} className="analysis-form">
          <textarea
            id="query"
            className="analysis-textarea"
            placeholder="e.g., We're a startup focusing on sustainable packaging solutions for e-commerce businesses..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {documentStatusMessage && (
            <div className="document-status-message">
              {documentStatusMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={!canGenerateAnalysis}
            className={`analysis-submit ${canGenerateAnalysis ? 'analysis-submit-enabled' : 'analysis-submit-disabled'}`}
          >
            {analyzing ? 'Processing...' : 'Generate Analysis'}
          </button>
        </form>

        {analyzing && (
          <div className="analysis-loading">
            <div className="analysis-spinner"></div>
            <div className="analysis-spinner-text">thinking hard...</div>
          </div>
        )}

        {error && (
          <div className="analysis-error">
            {error}
          </div>
        )}

        {result && (
          <div className="analysis-results">
            <h4 className="analysis-results-title">
              Analysis Results
              {responseLength && <span className="response-length">({responseLength} chars)</span>}
            </h4>
            <div
              className="analysis-results-content"
              dangerouslySetInnerHTML={{ __html: formatAnalysisText(result.analysis) }}
            ></div>
            <button
              onClick={() => handleDownload(result.document_path)}
              className="analysis-download"
            >
              Download Full Analysis
            </button>
          </div>
        )}
      </div>
    </section>
  );
} 