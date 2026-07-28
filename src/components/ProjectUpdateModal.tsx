import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, Folder, X, Check, ArrowRight, Github, RefreshCw } from 'lucide-react';
import { Language, BackgroundTask } from '../types';
import { translations } from '../locales/translations';

interface ProjectUpdateModalProps {
  token: string | null;
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  task: BackgroundTask | null;
}

interface StagedFile {
  file: File;
  relativePath: string;
}

export const ProjectUpdateModal: React.FC<ProjectUpdateModalProps> = ({
  token,
  lang,
  isOpen,
  onClose,
  onSuccess,
  task
}) => {
  const t = translations[lang];
  const [sourceType, setSourceType] = useState<'github' | 'files'>('files');
  const [githubUrl, setGithubUrl] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [installReqs, setInstallReqs] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setGithubUrl('');
      setStagedFiles([]);
      setUploadProgress('');
      setInstallReqs(true);
    }
  }, [isOpen]);

  if (!isOpen || !task) return null;

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

  const handleUpdate = async () => {
    if (sourceType === 'files' && stagedFiles.length === 0) {
      alert(lang === 'fa' ? 'لطفاً حداقل یک فایل یا پوشه انتخاب کنید.' : 'Please select at least one file or folder.');
      return;
    }
    if (sourceType === 'github' && !githubUrl.trim()) {
      alert(lang === 'fa' ? 'لطفاً لینک مخزن گیت‌هاب را وارد کنید.' : 'Please enter the GitHub repository link.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(
      lang === 'fa' 
        ? (sourceType === 'github' ? 'در حال دریافت آخرین تغییرات از گیت‌هاب...' : `در حال بارگذاری و بروزرسانی ${stagedFiles.length} فایل...`)
        : (sourceType === 'github' ? 'Fetching updates from GitHub...' : `Uploading & updating ${stagedFiles.length} files...`)
    );

    try {
      const formData = new FormData();
      formData.append('id', task.id);
      formData.append('sourceType', sourceType);
      formData.append('installRequirements', installReqs.toString());

      if (sourceType === 'files') {
        const filePaths: string[] = [];
        stagedFiles.forEach(sf => {
          formData.append('files', sf.file, sf.relativePath);
          filePaths.push(sf.relativePath);
        });
        formData.append('filePaths', JSON.stringify(filePaths));
      } else {
        formData.append('githubUrl', githubUrl.trim());
      }

      const res = await fetch('/api/processes/update', {
        method: 'POST',
        headers: { 'x-auth-token': token || '' },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || (lang === 'fa' ? 'بروزرسانی پروژه متوقف شد یا ناموفق بود' : 'Update failed'));
      }

      setUploadProgress(
        lang === 'fa'
          ? 'پروژه با موفقیت به‌روزرسانی و مجدداً راه‌اندازی شد!'
          : 'Project successfully updated and restarted!'
      );
      setTimeout(() => {
        setIsUploading(false);
        setStagedFiles([]);
        setGithubUrl('');
        onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      alert(err.message || (lang === 'fa' ? 'خطا در بروزرسانی پروژه' : 'Error updating project on server'));
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div 
        id="project-updater-modal"
        className="bg-[#0d1117] border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-neutral-200"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <RefreshCw className="h-5 w-5 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>
                  {lang === 'fa' ? 'به‌روزرسانی کد و فایل‌های پروژه' : 'Update Project Code & Files'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">v2.1 Active</span>
              </h2>
              <p className="text-xs text-neutral-400">
                {lang === 'fa'
                  ? 'کدها و منابع برنامه را جهت بروزرسانی مستقیم و راه‌اندازی مجدد ارسال کنید.'
                  : 'Upgrade and replace project resources seamlessly for safe process hot-reload.'}
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
          
          {/* Informational Project Header */}
          <div className="bg-[#161b22] p-4 rounded-xl border border-neutral-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {lang === 'fa' ? 'پروژه هدف:' : 'Target Project:'}
              </span>
              <span className="text-xs font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                {task.name}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400">
                {lang === 'fa' ? 'مسیر پروژه در سرور:' : 'Project Working Directory:'}
              </span>
              <span className="text-[11px] font-mono text-neutral-300">
                {task.cwd}
              </span>
            </div>
          </div>

          {/* Deployment Method Tab Selectors */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-300">
              {lang === 'fa' ? 'روش به‌روزرسانی:' : 'Update Source Method:'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceType('files')}
                className={`py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                  sourceType === 'files'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-md shadow-indigo-500/10'
                    : 'bg-[#161b22]/50 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
              >
                <UploadCloud className="h-4 w-4" />
                <span>{lang === 'fa' ? 'آپلود دستی فایل‌ها / پوشه' : 'Direct File / Folder Upload'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType('github')}
                className={`py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                  sourceType === 'github'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-md shadow-indigo-500/10'
                    : 'bg-[#161b22]/50 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
              >
                <Github className="h-4 w-4" />
                <span>{lang === 'fa' ? 'مخزن گیت‌هاب (GitHub)' : 'GitHub Repository URL'}</span>
              </button>
            </div>
          </div>

          {/* GitHub Source Inputs */}
          {sourceType === 'github' && (
            <div className="space-y-3 bg-[#161b22] p-5 rounded-xl border border-neutral-800">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  {lang === 'fa' ? 'لینک مستقیم مخزن گیت‌هاب جهت اعمال تغییرات:' : 'GitHub Repository URL:'}
                </label>
                <div className="relative">
                  <Github className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#0d1117] border border-neutral-700 text-neutral-200 font-mono text-xs focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {lang === 'fa'
                  ? '💡 سیستم به صورت خودکار دستور git pull را بر روی مسیر پروژه اعمال کرده و پردازش را ری‌استارت خواهد کرد.'
                  : '💡 The system will perform git pull directly inside the project directory and reload the active process.'}
              </p>
            </div>
          )}

          {/* Direct File/Folder Upload Inputs */}
          {sourceType === 'files' && (
            <div className="space-y-4">
              {/* Drag and Drop Box */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-neutral-700 bg-[#161b22]/60 hover:bg-[#161b22]'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="p-4 rounded-full bg-neutral-800 text-indigo-400 shadow-inner">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {lang === 'fa' ? 'فایل‌ها یا پوشه‌های جدید پروژه را به اینجا بکشید و رها کنید' : 'Drag updated files/folders here'}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    {lang === 'fa'
                      ? 'یا جهت انتخاب دستی فایل یا پوشه کلیک کنید'
                      : 'Or click to choose files or folder structures to update the project'}
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
                      {lang === 'fa' ? `فایل‌های تغییر یافته آماده بارگذاری (${stagedFiles.length})` : `Updated staged files (${stagedFiles.length})`}
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
                            <File className="h-4 w-4 text-indigo-400 shrink-0" />
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
          )}

          {/* Install requirements checkbox */}
          <div className="flex items-center gap-2 pt-1 bg-[#161b22]/40 p-3 rounded-xl border border-neutral-800/60">
            <input
              type="checkbox"
              id="update-install-requirements"
              checked={installReqs}
              onChange={(e) => setInstallReqs(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 border-neutral-700 bg-neutral-900 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="update-install-requirements" className="text-xs font-semibold text-neutral-300 cursor-pointer select-none">
              {lang === 'fa' ? 'نصب خودکار کتابخانه‌ها و وابستگی‌ها (pip install -r requirements.txt)' : 'Automatically install/update requirements.txt libraries'}
            </label>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-800 bg-[#161b22] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-neutral-400">
            {uploadProgress ? (
              <span className="text-indigo-400 flex items-center gap-2 font-medium">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {uploadProgress}
              </span>
            ) : (
              <span>
                {lang === 'fa' 
                  ? `${stagedFiles.length} فایل آماده بروزرسانی است.` 
                  : `${stagedFiles.length} files queued for hot upgrade.`}
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
              onClick={handleUpdate}
              disabled={isUploading || (sourceType === 'files' && stagedFiles.length === 0) || (sourceType === 'github' && !githubUrl.trim())}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>{lang === 'fa' ? 'در حال اعمال به‌روزرسانی...' : 'Updating...'}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>{lang === 'fa' ? 'تایید و به‌روزرسانی نهایی' : 'Confirm & Update'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
