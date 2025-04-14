import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DocumentContextProps {
    hasCompetitorFiles: boolean;
    hasBusinessFiles: boolean;
    setHasCompetitorFiles: (hasFiles: boolean) => void;
    setHasBusinessFiles: (hasFiles: boolean) => void;
}

const DocumentContext = createContext<DocumentContextProps | undefined>(undefined);

export const useDocumentContext = () => {
    const context = useContext(DocumentContext);
    if (!context) {
        throw new Error('useDocumentContext must be used within a DocumentProvider');
    }
    return context;
};

interface DocumentProviderProps {
    children: ReactNode;
}

export const DocumentProvider: React.FC<DocumentProviderProps> = ({ children }) => {
    const [hasCompetitorFiles, setHasCompetitorFiles] = useState(false);
    const [hasBusinessFiles, setHasBusinessFiles] = useState(false);

    const contextValue: DocumentContextProps = {
        hasCompetitorFiles,
        hasBusinessFiles,
        setHasCompetitorFiles,
        setHasBusinessFiles,
    };

    return (
        <DocumentContext.Provider value={contextValue}>
            {children}
        </DocumentContext.Provider>
    );
}; 