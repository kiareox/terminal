import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, Folder, X, Check, RefreshCw } from 'lucide-react';
import { Language } from '../types';

interface DirectFileUploadModalProps {
  token: string | null;
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentPath: string;
}

interface StagedFile {
  file: File;
  relativePath: string;
}

export const DirectFileUploadModal: React.FC<DirectFileUploadModalProps> = ({
  token,
  lang,
  isOpen,
  onClose,
  onSuccess,
  currentPath
}) => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStagedFiles([]);
      setUploadProgress('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFilesAdded = (incomingFiles: FileList | File[]) => {
    const newFiles: StagedFile[] = Array.from(incomingFiles).map(file => ({
      file,
      relativePath: (file as any).webkitRelativePath || file.name
    }));
    setStagedFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesAdded(e.dataTransfer.files);
      }
      return;
    }

    const collectedFiles: File[] = [];
    const traverseEntry = async (entry: any, pathPrefix = '') => {
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file((file: File) => {
            const relPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
            Object.defineProperty(file, 'webkitRelativePath', {
              value: relPath,
              writable: true
            });
            collectedFiles.push(file);
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readEntries = (): Promise<any[]> => {
          return new Promise((resolve) => {
            dirReader.readEntries((entries: any[]) => resolve(entries));
          });
        };
        let entries = await readEntries();
        while (entries.length > 0) {
          for (const childEntry of entries) {
            await traverseEntry(childEntry, pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name);
          }
          entries = await readEntries();
        }
      }
    };

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        promises.push(traverseEntry(entry));
      } else {
        const file = item.getAsFile();
        if (file) collectedFiles.push(file);
      }
    }

    await Promise.all(promises);
    if (collectedFiles.length > 0) {
      handleFilesAdded(collectedFiles);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleUpload = async () => {
    if (stagedFiles.length === 0) {
      alert(lang === 'fa' ? 'لطفاً حداقل یک فایل یا پوشه انتخاب کنید.' : 'Please select at least one file or folder.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(
      lang === 'fa' 
        ? `در حال آپلود ${stagedFiles.length} فایل به مسیر سرور...` 
        : `Uploading ${stagedFiles.length} files to server path...`
    );

    try {
      const batchSize = 30; // batch upload for safety
      let uploadedCount = 0;

      for (let i = 0; i < stagedFiles.length; i += batchSize) {
        const batch = stagedFiles.slice(i, i + batchSize);
        const formData = new FormData();
        const filePaths: string[] = [];

        batch.forEach(sf => {
          formData.append('files', sf.file, sf.relativePath);
          filePaths.push(sf.relativePath);
        });
        formData.append('filePaths', JSON.stringify(filePaths));

        setUploadProgress(
          lang === 'fa'
            ? `در حال آپلود ${Math.min(i + batch.length, stagedFiles.length)} از ${stagedFiles.length} فایل...`
            : `Uploading ${Math.min(i + batch.length, stagedFiles.length)} of ${stagedFiles.length} files...`
        );

        const res = await fetch(`/api/files/upload?targetDir=${encodeURIComponent(currentPath)}`, {
          method: 'POST',
          headers: { 'x-auth-token': token || '' },
          body: formData
        });

        if (!res.ok) {
          throw new Error('Upload failed');
        }

        uploadedCount += batch.length;
      }

      setUploadProgress(
        lang === 'fa'
          ? 'تمامی فایل‌ها با موفقیت آپلود شدند!'
          : 'All files successfully uploaded!'
      );
      
      setTimeout(() => {
        setIsUploading(false);
        setStagedFiles([]);
        onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      alert(err.message || (lang === 'fa' ? 'خطا در بارگذاری فایل‌ها' : 'Error uploading files'));
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div 
        id="direct-file-uploader-modal"
        className="bg-[#0d1117] border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-neutral-200"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === 'fa' ? 'آپلود مستقیم فایل به سرور' : 'Direct Server File Upload'}
              </h2>
              <p className="text-xs text-neutral-400">
                {lang === 'fa'
                  ? 'فایل‌ها یا پوشه‌های خود را انتخاب کرده یا بکشید و رها کنید.'
                  : 'Select or drag & drop files/folders directly to the current server directory.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* Target Folder Path Display */}
          <div className="bg-[#161b22] p-4 rounded-xl border border-neutral-800">
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              {lang === 'fa' ? 'مسیر مقصد در سرور:' : 'Target Server Path:'}
            </label>
            <input
              type="text"
              readOnly
              value={currentPath}
              className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-neutral-700 text-emerald-400 font-mono text-xs outline-none cursor-not-allowed select-all"
            />
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-neutral-700 bg-[#161b22]/60 hover:bg-[#161b22]'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-4 rounded-full bg-neutral-800 text-emerald-400 shadow-inner">
              <UploadCloud className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {lang === 'fa' ? 'فایل‌ها یا پوشه‌های خود را به اینجا بکشید و رها کنید' : 'Drag files or folders here'}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                {lang === 'fa'
                  ? 'یا جهت انتخاب دستی فایل یا پوشه کلیک کنید'
                  : 'Or click to choose your files or folders (.zip, .py, .js, .json, folders)'}
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
            />
            <input
              type="file"
              ref={folderInputRef}
              multiple
              {...({ webkitdirectory: "", directory: "" } as any)}
              className="hidden"
              onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
            />
          </div>

          {/* Staged Files List */}
          {stagedFiles.length > 0 && (
            <div className="bg-[#161b22] border border-neutral-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#0d1117] border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-300">
                <span>
                  {lang === 'fa' ? `فایل‌های آماده آپلود (${stagedFiles.length})` : `Staged files for upload (${stagedFiles.length})`}
                </span>
                <button
                  onClick={() => setStagedFiles([])}
                  className="text-rose-400 hover:text-rose-300 transition cursor-pointer text-xs"
                >
                  {lang === 'fa' ? 'پاک کردن همه' : 'Clear all'}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-neutral-800/60 font-mono text-xs">
                {stagedFiles.map((sf, index) => (
                  <div key={index} className="px-4 py-2.5 flex items-center justify-between hover:bg-neutral-800/40 transition">
                    <div className="flex items-center gap-2.5 truncate">
                      {sf.relativePath.includes('/') ? (
                        <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                      ) : (
                        <File className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-neutral-300 truncate">{sf.relativePath}</span>
                      <span className="text-[10px] text-neutral-500">({(sf.file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-rose-400 transition cursor-pointer"
                      title="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-800 bg-[#161b22] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-neutral-400">
            {uploadProgress ? (
              <span className="text-emerald-400 flex items-center gap-2 font-medium">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {uploadProgress}
              </span>
            ) : (
              <span>
                {lang === 'fa' 
                  ? `تعداد ${stagedFiles.length} فایل آماده ارسال است.` 
                  : `${stagedFiles.length} files queued for upload.`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {lang === 'fa' ? 'انصراف' : 'Cancel'}
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || stagedFiles.length === 0}
              className="px-5 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>{lang === 'fa' ? 'در حال آپلود...' : 'Uploading...'}</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'شروع آپلود فایل‌ها' : 'Start Uploading'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
