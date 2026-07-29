import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File, Folder, X, Check, ArrowRight, GitCommit, Github } from 'lucide-react';
import { Language } from '../types';
import { translations } from '../locales/translations';

interface GithubUploadDeployModalProps {
  token: string | null;
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPath?: string;
  isDeployMode?: boolean;
  initialTaskName?: string;
  initialCommand?: string;
}

interface StagedFile {
  file: File;
  relativePath: string;
}

export const GithubUploadDeployModal: React.FC<GithubUploadDeployModalProps> = ({
  token,
  lang,
  isOpen,
  onClose,
  onSuccess,
  defaultPath = '',
  isDeployMode = false,
  initialTaskName = '',
  initialCommand = ''
}) => {
  const t = translations[lang];
  const [sourceType, setSourceType] = useState<'github' | 'files'>('github');
  const [githubUrl, setGithubUrl] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [targetPath, setTargetPath] = useState(defaultPath);
  const [commitMessage, setCommitMessage] = useState('Update files and deploy to server');
  const [command, setCommand] = useState(initialCommand || 'python3 main.py');
  const [taskName, setTaskName] = useState(initialTaskName || 'MyServerApp');
  const [installReqs, setInstallReqs] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Automatically update the Target Server Path to include the folder named after the App Name (نام برنامه)
  const handleTaskNameChange = (name: string) => {
    setTaskName(name);
    const folderName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (folderName) {
      setTargetPath(defaultPath && defaultPath !== '/var/www' ? `${defaultPath}/${folderName}` : folderName);
    } else {
      setTargetPath(defaultPath || '');
    }
  };

  const handleGithubUrlChange = (url: string) => {
    setGithubUrl(url);
    const trimmed = url.trim();
    if (trimmed) {
      const match = trimmed.match(/(?:github\.com|raw\.githubusercontent\.com)\/([^\/]+)\/([^\/]+)/);
      if (match) {
        let repoName = match[2].replace(/\.git$/, '');
        if (repoName.includes('/')) repoName = repoName.split('/')[0];
        if (repoName && (taskName === 'MyServerApp' || !taskName)) {
          setTaskName(repoName);
          const folderName = repoName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
          const basePath = defaultPath && defaultPath !== '/var/www' ? defaultPath : '';
          setTargetPath(basePath ? `${basePath}/${folderName}` : folderName);
        }
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      const initialName = initialTaskName || 'MyServerApp';
      setTaskName(initialName);
      const folderName = initialName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const basePath = defaultPath && defaultPath !== '/var/www' ? defaultPath : '';
      setTargetPath(basePath ? `${basePath}/${folderName}` : folderName);
      if (initialCommand) setCommand(initialCommand);
      setGithubUrl('');
      setStagedFiles([]);
    }
  }, [isOpen, defaultPath, initialTaskName, initialCommand]);

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

  const handleCommitAndUpload = async () => {
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
        ? (sourceType === 'github' ? 'در حال دریافت و کلون کامل مخزن گیت‌هاب...' : `در حال ارسال ${stagedFiles.length} فایل به سرور...`)
        : (sourceType === 'github' ? 'Cloning GitHub repository...' : `Uploading ${stagedFiles.length} files to server...`)
    );

    try {
      const formData = new FormData();
      formData.append('name', taskName);
      formData.append('command', command);
      formData.append('sourceType', sourceType);
      formData.append('targetDir', targetPath);
      formData.append('installRequirements', installReqs.toString());

      if (sourceType === 'files') {
        const filePaths: string[] = [];
        stagedFiles.forEach(sf => {
          formData.append('files', sf.file, sf.relativePath);
          filePaths.push(sf.relativePath);
        });
        formData.append('filePaths', JSON.stringify(filePaths));
        formData.append('commitMessage', commitMessage);
      } else {
        formData.append('githubUrl', githubUrl.trim());
      }

      const res = await fetch('/api/processes/run-background', {
        method: 'POST',
        headers: { 'x-auth-token': token || '' },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || (lang === 'fa' ? 'دپلوی پروژه متوقف شد یا ناموفق بود' : 'Deploy failed'));
      }

      setUploadProgress(
        lang === 'fa'
          ? 'پروژه با موفقیت دپلوی و به عنوان پردازش پس‌زمینه اجرا شد!'
          : 'Project successfully deployed and launched as a background process!'
      );
      setTimeout(() => {
        setIsUploading(false);
        setStagedFiles([]);
        setGithubUrl('');
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      alert(err.message || (lang === 'fa' ? 'خطا در بارگذاری و دپلوی پروژه' : 'Error deploying project on server'));
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0d1117] border border-neutral-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-neutral-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#161b22] border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-800 rounded-lg text-emerald-400">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>
                  {lang === 'fa'
                    ? (isDeployMode ? 'استقرار و دپلوی هوشمند پروژه' : 'آپلود مستقیم فایل‌ها و اعمال تغییرات')
                    : (isDeployMode ? 'Smart Project Deployment' : 'Direct File Upload & Commit')}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">v2.1 Active</span>
              </h2>
              <p className="text-xs text-neutral-400">
                {lang === 'fa'
                  ? 'یک مخزن گیت‌هاب را متصل کنید یا فایل‌های خود را به صورت دستی بارگذاری نمایید.'
                  : 'Connect a GitHub repository or upload your custom project archive directly.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          
          {/* Main App Config & Target Folder */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#161b22] p-4 rounded-xl border border-neutral-800">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                {lang === 'fa' ? 'نام برنامه / سرویس (App Name):' : 'App / Service Name:'}
              </label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => handleTaskNameChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-neutral-700 text-neutral-200 text-xs focus:border-emerald-500 outline-none"
                placeholder="e.g. MyTelegramBot"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                {lang === 'fa' ? 'مسیر ذخیره‌سازی فایل‌ها در سرور:' : 'Server Save Destination Path:'}
              </label>
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-neutral-700 text-emerald-400 font-mono text-xs focus:border-emerald-500 outline-none"
              />
            </div>
            {isDeployMode && (
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  {lang === 'fa' ? 'دستور راه‌اندازی و اجرا:' : 'Launch Run Command:'}
                </label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#0d1117] border border-neutral-700 text-emerald-400 font-mono text-xs focus:border-emerald-500 outline-none"
                  placeholder="python3 telegram_bot.py or npm start"
                />
              </div>
            )}
          </div>

          {/* Deployment Method Tab Selectors */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-300">
              {lang === 'fa' ? 'روش دریافت و منبع پروژه:' : 'Project Source & Transfer Method:'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceType('github')}
                className={`py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                  sourceType === 'github'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10'
                    : 'bg-[#161b22]/50 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
              >
                <Github className="h-4 w-4" />
                <span>{lang === 'fa' ? 'لینک مخزن گیت‌هاب (GitHub)' : 'GitHub Repository URL'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSourceType('files')}
                className={`py-3 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                  sourceType === 'files'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10'
                    : 'bg-[#161b22]/50 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                }`}
              >
                <UploadCloud className="h-4 w-4" />
                <span>{lang === 'fa' ? 'آپلود دستی فایل‌ها / پوشه' : 'Direct File / Folder Upload'}</span>
              </button>
            </div>
          </div>

          {/* GitHub Source Inputs */}
          {sourceType === 'github' && (
            <div className="space-y-3 bg-[#161b22] p-5 rounded-xl border border-neutral-800">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  {lang === 'fa' ? 'لینک مستقیم مخزن گیت‌هاب:' : 'GitHub Repository URL:'}
                </label>
                <div className="relative">
                  <Github className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                  <input
                    type="text"
                    value={githubUrl}
                    onChange={(e) => handleGithubUrlChange(e.target.value)}
                    placeholder="https://github.com/username/repository"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[#0d1117] border border-neutral-700 text-neutral-200 font-mono text-xs focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                {lang === 'fa'
                  ? '💡 سیستم به صورت خودکار مخزن عمومی را در مسیر مشخص شده کلون کرده و اسکریپت را شروع می‌کند.'
                  : '💡 The system will clone the repository directly into the target server path and launch it.'}
              </p>
            </div>
          )}

          {/* Direct File/Folder Upload Inputs */}
          {sourceType === 'files' && (
            <div className="space-y-4">
              {/* GitHub Drag and Drop Box */}
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
                    {lang === 'fa' ? 'فایل‌ها یا پوشه‌های خود را به اینجا بکشید و رها کنید' : 'Drag additional files here to add them to your server'}
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
                  <div className="px-4 py-3 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-300">
                    <span>
                      {lang === 'fa' ? `فایل‌های انتخاب شده برای دپلوی (${stagedFiles.length})` : `Staged files for deployment (${stagedFiles.length})`}
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

              {/* Commit Message Box */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-300">
                  {lang === 'fa' ? 'توضیحات و پیام تایید آپلود:' : 'Commit summary & deployment notes:'}
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[#161b22] border border-neutral-700 text-neutral-200 text-xs focus:border-emerald-500 outline-none font-medium"
                  placeholder={lang === 'fa' ? 'مثال: بارگذاری فایل‌های جدید سرور' : 'Add server updates / commit changes'}
                />
              </div>
            </div>
          )}

          {isDeployMode && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="installReqs"
                checked={installReqs}
                onChange={(e) => setInstallReqs(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-800 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <label htmlFor="installReqs" className="text-xs text-neutral-300 cursor-pointer font-medium">
                {lang === 'fa'
                  ? 'نصب خودکار پیش‌نیازها از requirements.txt یا package.json'
                  : 'Auto-install requirements from requirements.txt or package.json (pip install / npm install)'}
              </label>
            </div>
          )}

          {uploadProgress && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-mono flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              <span>{uploadProgress}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#161b22] border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-neutral-700 text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition cursor-pointer"
          >
            {lang === 'fa' ? 'انصراف' : 'Cancel'}
          </button>
          <button
            onClick={handleCommitAndUpload}
            disabled={isUploading || (sourceType === 'files' && stagedFiles.length === 0) || (sourceType === 'github' && !githubUrl.trim())}
            className="px-5 py-2.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            {isUploading ? (
              <span>{lang === 'fa' ? 'در حال ارسال...' : 'Processing...'}</span>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                <span>
                  {lang === 'fa'
                    ? (isDeployMode ? 'تایید و دپلوی روی سرور' : 'شروع آپلود فایل‌ها')
                    : (isDeployMode ? 'Commit changes & Deploy' : 'Commit changes & Upload')}
                </span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
