import { useState } from 'react'
import DocumentUpload from './components/DocumentUpload'
import CompetitorAnalysis from './components/CompetitorAnalysis'
import { Tab } from '@headlessui/react'
import { DocumentTextIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-gray-900">
              Competitor Analysis RAG System
            </h1>
          </div>
        </header>
        <main>
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="px-4 py-8 sm:px-0">
              <Tab.Group>
                <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1">
                  <Tab
                    className={({ selected }) =>
                      `w-full rounded-lg py-2.5 text-sm font-medium leading-5 
                      ${selected 
                        ? 'bg-white text-blue-700 shadow'
                        : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <DocumentTextIcon className="h-5 w-5" />
                      <span>Upload Documents</span>
                    </div>
                  </Tab>
                  <Tab
                    className={({ selected }) =>
                      `w-full rounded-lg py-2.5 text-sm font-medium leading-5 
                      ${selected 
                        ? 'bg-white text-blue-700 shadow'
                        : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                      }`
                    }
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <ChartBarIcon className="h-5 w-5" />
                      <span>Analyze Competitors</span>
                    </div>
                  </Tab>
                </Tab.List>
                <Tab.Panels className="mt-6">
                  <Tab.Panel>
                    <DocumentUpload />
                  </Tab.Panel>
                  <Tab.Panel>
                    <CompetitorAnalysis />
                  </Tab.Panel>
                </Tab.Panels>
              </Tab.Group>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
