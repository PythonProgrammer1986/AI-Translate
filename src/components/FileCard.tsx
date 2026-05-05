import React from 'react';
import { FileUp, Loader2, CheckCircle2, Download, AlertCircle, X, FileText, Image as ImageIcon, FileSpreadsheet, Ban } from 'lucide-react';
import type { FileTask } from '../App';

export const FileCard: React.FC<{ task: FileTask, onRemove: () => void }> = ({ task, onRemove }) => {
  const getIcon = () => {
    const type = task.file.type;
    const name = task.file.name.toLowerCase();
    if (type.includes('image') || name.match(/\.(jpg|jpeg|png|webp)$/)) return <ImageIcon className="w-5 h-5 text-purple-500" />;
    if (type.includes('pdf') || name.endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    if (name.match(/\.(xlsx|xls|csv)$/)) return <FileSpreadsheet className="w-5 h-5 text-green-500" />;
    if (name.endsWith('.docx')) return <FileText className="w-5 h-5 text-blue-500" />;
    return <FileUp className="w-5 h-5 text-gray-500" />;
  };

  const handleDownload = () => {
    if (!task.outputBlob) return;
    const url = URL.createObjectURL(task.outputBlob);
    const a = document.createElement('a');
    a.href = url;
    
    // Add prefix
    const nameMatch = task.file.name.match(/^(.*?)(\.[^.]+)?$/);
    const nameWithoutExt = nameMatch?.[1] || task.file.name;
    const ext = task.outputExt || nameMatch?.[2] || '';
    
    a.download = `Translated_${nameWithoutExt}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="p-2 bg-gray-50 rounded-lg">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate" title={task.file.name}>
            {task.file.name}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{(task.file.size / 1024 / 1024).toFixed(2)} MB</span>
            <span className="text-xs text-gray-300">•</span>
            {task.status === 'processing' && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {task.progressMsg}
              </span>
            )}
            {task.status === 'pending' && <span className="text-xs text-gray-500">{task.progressMsg}</span>}
            {task.status === 'done' && <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {task.progressMsg}</span>}
            {task.status === 'error' && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1 truncate" title={task.error}>
                <AlertCircle className="w-3 h-3" /> {task.error}
              </span>
            )}
            {task.status === 'cancelled' && (
              <span className="text-xs text-amber-600 font-medium flex items-center gap-1 truncate" title={task.progressMsg}>
                <Ban className="w-3 h-3" /> {task.progressMsg}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {task.status === 'done' && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        )}
        {(task.status === 'pending' || task.status === 'error' || task.status === 'done' || task.status === 'cancelled') && (
           <button onClick={onRemove} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors">
              <X className="w-4 h-4" />
           </button>
        )}
      </div>
    </div>
  );
}
