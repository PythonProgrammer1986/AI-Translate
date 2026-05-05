import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { processXlsx } from './lib/processors/xlsx';
import { processDocx } from './lib/processors/docx';
import { processPdf } from './lib/processors/pdf';
import { processImage } from './lib/processors/image';
import { FileCard } from './components/FileCard';
import { FileUp, UploadCloud, Key, X } from 'lucide-react';

export interface FileTask {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error' | 'cancelled';
  progressMsg: string;
  outputBlob?: Blob;
  error?: string;
}

export default function App() {
  const [tasks, setTasks] = useState<FileTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const cancelRef = useRef(false);
  
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('CUSTOM_GEMINI_API_KEY') || '');

  const saveApiKey = () => {
    if (apiKeyInput.trim()) {
      localStorage.setItem('CUSTOM_GEMINI_API_KEY', apiKeyInput.trim());
    } else {
      localStorage.removeItem('CUSTOM_GEMINI_API_KEY');
    }
    setShowSettings(false);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setTasks(prev => {
      const remainingSlots = 20 - prev.length;
      const filesToAdd = acceptedFiles.slice(0, Math.max(0, remainingSlots));
      const newTasks = filesToAdd.map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        status: 'pending' as const,
        progressMsg: 'Waiting in queue...'
      }));
      return [...prev, ...newTasks];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 20,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    }
  } as any);

  const updateTask = (id: string, updates: Partial<FileTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleProcessAll = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    cancelRef.current = false;

    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'error');

    const processTask = async (task: FileTask) => {
      if (cancelRef.current) return;

      updateTask(task.id, { status: 'processing', progressMsg: 'Starting translation...' });
      try {
        const name = task.file.name.toLowerCase();
        let blob: Blob;

        const setProgress = (msg: string) => {
          if (!cancelRef.current) {
            updateTask(task.id, { progressMsg: msg });
          }
        };

        if (name.endsWith('.xlsx')) {
          blob = await processXlsx(task.file, setProgress);
        } else if (name.endsWith('.docx')) {
          blob = await processDocx(task.file, setProgress);
        } else if (name.endsWith('.pdf')) {
          blob = await processPdf(task.file, setProgress);
        } else if (task.file.type.startsWith('image/')) {
          blob = await processImage(task.file, setProgress);
        } else {
          throw new Error("Unsupported file type. Need .xlsx, .docx, .pdf or image.");
        }

        if (!cancelRef.current) {
          updateTask(task.id, {
            status: 'done',
            progressMsg: 'Completed successfully!',
            outputBlob: blob
          });
        }
      } catch (err: any) {
         console.error(err);
         if (!cancelRef.current) {
           updateTask(task.id, {
            status: 'error',
            progressMsg: 'Failed',
            error: err.message || String(err)
          });
         }
      }
    };

    const CONCURRENCY_LIMIT = 5;
    const executing = new Set<Promise<void>>();

    for (const task of pendingTasks) {
      if (cancelRef.current) break;
      const p = processTask(task).finally(() => executing.delete(p));
      executing.add(p);
      if (executing.size >= CONCURRENCY_LIMIT) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);

    if (!cancelRef.current) {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel the remaining translations?')) {
      cancelRef.current = true;
      setIsProcessing(false);
      setTasks(prev => prev.map(t => 
        (t.status === 'pending' || t.status === 'processing') 
          ? { ...t, status: 'cancelled', progressMsg: 'Cancelled' } 
          : t
      ));
    }
  };

  const handleRetryFailed = () => {
    setTasks(prev => prev.map(t => 
      t.status === 'error' ? { ...t, status: 'pending', progressMsg: 'Waiting in queue...', error: undefined } : t
    ));
  };

  const processableTasks = tasks.filter(t => t.status !== 'cancelled');
  const completedTasks = processableTasks.filter(t => t.status === 'done' || t.status === 'error');
  const progressPercent = processableTasks.length > 0 ? (completedTasks.length / processableTasks.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 md:px-8 font-sans text-gray-900">
       <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
         <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-10 text-white flex gap-4 items-center relative">
            <button 
              onClick={() => setShowSettings(true)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">Set API Key</span>
            </button>
            <div className="bg-white/20 p-3 rounded-xl">
               <FileUp className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">DocTranslator AI</h1>
              <p className="text-blue-100 mt-1">Translate documents and images to English. Preserves native format. Max 20 files.</p>
            </div>
         </div>

         {showSettings && (
           <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
             <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md relative">
               <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                 <X className="w-5 h-5" />
               </button>
               <h2 className="text-xl font-semibold mb-4 text-gray-800">API Key Settings</h2>
               <p className="text-sm text-gray-600 mb-4">
                 Enter your own Gemini API Key. This will be stored locally in your browser. Leave blank to use the default environment key.
               </p>
               <input 
                 type="password" 
                 value={apiKeyInput}
                 onChange={(e) => setApiKeyInput(e.target.value)}
                 placeholder="AIzaSy..."
                 className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
               />
               <div className="flex justify-end gap-3">
                 <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                   Cancel
                 </button>
                 <button onClick={saveApiKey} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                   Save Key
                 </button>
               </div>
             </div>
           </div>
         )}

         <div className="p-8">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <input {...getInputProps()} />
              <UploadCloud className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700">Drag & drop documents here, or click to select</p>
              <p className="text-sm text-gray-500 mt-2">Supports PDF, DOCX, XLSX, and Images</p>
            </div>

            {tasks.length > 0 && (
              <div className="mt-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                   <h2 className="text-lg font-semibold text-gray-800">Files ({tasks.length}/20)</h2>
                   
                   <div className="flex items-center gap-3">
                     {tasks.some(t => t.status === 'error') && !isProcessing && (
                       <button
                         onClick={handleRetryFailed}
                         className="text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 px-4 py-2 rounded-lg font-medium transition-colors"
                       >
                         Retry Failed
                       </button>
                     )}
                     
                     {isProcessing && (
                       <button
                         onClick={handleCancel}
                         className="text-gray-700 bg-white border border-gray-300 shadow-sm hover:bg-gray-50 px-4 py-2 rounded-lg font-medium transition-colors"
                       >
                         Cancel
                       </button>
                     )}
                     
                     <button
                       onClick={handleProcessAll}
                       disabled={isProcessing || !tasks.some(t => t.status === 'pending' || t.status === 'error')}
                       className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
                     >
                       {isProcessing ? 'Translating...' : 'Translate All'}
                     </button>
                   </div>
                </div>

                {isProcessing && processableTasks.length > 0 && (
                  <div className="mb-6">
                    <div className="flex justify-between text-sm font-medium text-gray-600 mb-2">
                       <span>Translation Progress</span>
                       <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                       <div 
                         className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                         style={{ width: `${progressPercent}%` }}
                       ></div>
                    </div>
                  </div>
                )}

                <div className="grid gap-3">
                  {tasks.map(task => (
                    <FileCard key={task.id} task={task} onRemove={() => setTasks(prev => prev.filter(t => t.id !== task.id))}/>
                  ))}
                </div>
              </div>
            )}
         </div>
       </div>
    </div>
  )
}
