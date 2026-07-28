import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Folder,
  File,
  FileCode,
  FileText,
  Upload,
  UploadCloud,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Trash2,
  Edit,
  Download,
  Key,
  ChevronRight,
  Save,
  X,
  Check,
  HardDrive,
  Copy,
  GitCommit
} from 'lucide-react';
import { FileItem, Language } from '../types';
import { translations } from '../locales/translations';
import { DirectFileUploadModal } from './DirectFileUploadModal';

interface FileManagerProps {
  token: string | null;
  lang: Language;
}

export const FileManager: React.FC<FileManagerProps> = ({ token, lang }) => {
  const t = translations[lang];
  const [currentPath, setCurrentPath] = useState<string>('/var/www');
  const [items, setItems] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [chmodItem, setChmodItem] = useState<{ path: string; mode: string } | null>(null);
  const [renameItem, setRenameItem] = useState<{ oldPath: string; newName: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [isDirectUploadModalOpen, setIsDirectUploadModalOpen] = useState(false);

  const processUploadFiles = async (filesList: File[]) => {
    if (!filesList || filesList.length === 0) return;
    setIsUploading(true);
    setUploadStatus(`در حال آماده‌سازی ${filesList.length} فایل...`);

    const batchSize = 30; // 30 files per request chunk
    let uploadedCount = 0;

    try {
      for (let i = 0; i < filesList.length; i += batchSize) {
        const batch = filesList.slice(i, i + batchSize);
        const formData = new FormData();

        batch.forEach((file) => {
          const relativePath = (file as any).webkitRelativePath || file.name;
          formData.append('files', file, relativePath);
        });

        setUploadStatus(`در حال آپلود ${Math.min(i + batch.length, filesList.length)} از ${filesList.length} فایل...`);

        const res = await fetch(`/api/files/upload?targetDir=${encodeURIComponent(currentPath)}`, {
          method: 'POST',
          headers: {
            'x-auth-token': token || ''
          },
          body: formData
        });

        if (!res.ok) {
          throw new Error('Upload failed');
        }

        uploadedCount += batch.length;
      }

      setUploadStatus(`${uploadedCount} فایل با موفقیت آپلود شد`);
      fetchFiles(currentPath);
      setTimeout(() => setUploadStatus(''), 3500);
    } catch (err) {
      alert('خطا در آپلود فایل‌ها');
      setUploadStatus('خطا در آپلود');
      setTimeout(() => setUploadStatus(''), 3500);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    if (!items) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processUploadFiles(Array.from(e.dataTransfer.files));
      }
      return;
    }

    const files: File[] = [];
    const traverseEntry = async (entry: any, pathPrefix = '') => {
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file((file: File) => {
            const relPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
            Object.defineProperty(file, 'webkitRelativePath', {
              value: relPath,
              writable: true
            });
            files.push(file);
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
        if (file) files.push(file);
      }
    }

    await Promise.all(promises);
    if (files.length > 0) {
      processUploadFiles(files);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const fetchFiles = async (pathUrl?: string) => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const target = pathUrl || currentPath;
    try {
      const res = await fetch(`/api/files/list?path=${encodeURIComponent(target)}`, {
        headers: { 'x-auth-token': token }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setCurrentPath(data.path);
        setItems(data.items || []);
      }
    } catch (e) {
      console.error('Failed to list files:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetch('/api/terminal/cwd', {
        headers: { 'x-auth-token': token }
      })
        .then(res => res.json())
        .then(data => {
          if (data && data.cwd) {
            setCurrentPath(data.cwd);
            fetchFiles(data.cwd);
          } else {
            fetchFiles(currentPath);
          }
        })
        .catch(() => {
          fetchFiles(currentPath);
        });
    }
  }, [token]);

  const handleNavigate = (newPath: string) => {
    setSelectedPaths([]);
    fetchFiles(newPath);
  };

  const handleToggleSelectAll = () => {
    if (selectedPaths.length === items.length) {
      setSelectedPaths([]);
    } else {
      setSelectedPaths(items.map(i => i.path));
    }
  };

  const handleToggleSelect = (path: string) => {
    if (selectedPaths.includes(path)) {
      setSelectedPaths(selectedPaths.filter(p => p !== path));
    } else {
      setSelectedPaths([...selectedPaths, path]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPaths.length === 0) return;
    if (!confirm(t.confirmDelete)) return;
    try {
      for (const itemPath of selectedPaths) {
        await fetch('/api/files/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': token || ''
          },
          body: JSON.stringify({ itemPath })
        });
      }
      setSelectedPaths([]);
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to delete selected items');
    }
  };

  const handleBulkDownload = () => {
    items.filter(item => selectedPaths.includes(item.path)).forEach(item => {
      const a = document.createElement('a');
      a.href = `/api/files/download?path=${encodeURIComponent(item.path)}`;
      a.target = '_blank';
      a.download = item.isDirectory ? `${item.name}.zip` : item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  };

  const handleOpenFile = async (item: FileItem) => {
    if (item.isDirectory) {
      handleNavigate(item.path);
    } else {
      try {
        const res = await fetch(`/api/files/read?path=${encodeURIComponent(item.path)}`, {
          headers: { 'x-auth-token': token || '' }
        });
        if (res.ok) {
          const data = await res.json();
          setEditingFile({ path: item.path, content: data.content });
        }
      } catch (e) {
        alert('Failed to read file');
      }
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ filePath: editingFile.path, content: editingFile.content })
      });
      if (res.ok) {
        setEditingFile(null);
        fetchFiles(currentPath);
      }
    } catch (e) {
      alert('Failed to save file');
    }
  };

  const handleCreateFolder = async () => {
    const folderName = prompt(t.createFolderPrompt);
    if (!folderName) return;
    try {
      const dirPath = `${currentPath}/${folderName}`;
      await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ dirPath })
      });
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to create folder');
    }
  };

  const handleCreateFile = async () => {
    const fileName = prompt(t.createFilePrompt);
    if (!fileName) return;
    try {
      const filePath = `${currentPath}/${fileName}`;
      await fetch('/api/files/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ filePath })
      });
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to create file');
    }
  };

  const handleDelete = async (itemPath: string) => {
    if (!confirm(t.confirmDelete)) return;
    try {
      await fetch('/api/files/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ itemPath })
      });
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to delete item');
    }
  };

  const handleChmodSave = async () => {
    if (!chmodItem) return;
    try {
      await fetch('/api/files/chmod', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ itemPath: chmodItem.path, mode: chmodItem.mode })
      });
      setChmodItem(null);
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to update permissions');
    }
  };

  const handleRenameSave = async () => {
    if (!renameItem) return;
    const pathParts = renameItem.oldPath.split('/');
    pathParts.pop();
    const newPath = [...pathParts, renameItem.newName].join('/');
    try {
      await fetch('/api/files/rename', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ oldPath: renameItem.oldPath, newPath })
      });
      setRenameItem(null);
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to rename item');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Top Bar with Path Breadcrumb and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-amber-500" />
            <span>{t.fileManager}</span>
          </h2>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 mt-1 font-mono text-xs text-neutral-600 dark:text-neutral-400 overflow-x-auto pb-1">
            <button
              onClick={() => handleNavigate('/')}
              className="hover:text-blue-400 transition flex items-center gap-1 cursor-pointer font-bold text-neutral-800 dark:text-gray-200"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>root</span>
            </button>
            {pathParts.map((part, index) => {
              const buildPath = '/' + pathParts.slice(0, index + 1).join('/');
              return (
                <React.Fragment key={buildPath}>
                  <ChevronRight className="h-3 w-3 text-neutral-400" />
                  <button
                    onClick={() => handleNavigate(buildPath)}
                    className="hover:text-blue-400 transition cursor-pointer text-neutral-700 dark:text-gray-300"
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
            <button
              onClick={() => {
                navigator.clipboard.writeText(currentPath);
                alert('Path copied to clipboard!');
              }}
              title="Copy path"
              className="ml-2 p-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-500 hover:text-blue-400 transition"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* File Manager Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsDirectUploadModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/25"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>{lang === 'fa' ? 'آپلود' : 'Upload'}</span>
          </button>

          <button
            onClick={handleCreateFolder}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#121214] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-800 dark:text-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5 text-amber-500" />
            <span>{t.newFolder}</span>
          </button>

          <button
            onClick={handleCreateFile}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#121214] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-800 dark:text-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FilePlus className="h-3.5 w-3.5 text-blue-500" />
            <span>{t.newFile}</span>
          </button>

          <button
            onClick={() => fetchFiles(currentPath)}
            className="p-2 rounded-xl border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#121214] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-800 dark:text-neutral-200 transition cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Upload Status Alert Bar */}
      {uploadStatus && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium flex items-center gap-2.5 animate-pulse">
          <RefreshCw className={`h-4 w-4 text-blue-400 ${isUploading ? 'animate-spin' : ''}`} />
          <span>{uploadStatus}</span>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedPaths.length > 0 && (
        <div className="p-3 rounded-xl bg-neutral-900 text-white dark:bg-neutral-800 flex items-center justify-between shadow-xl animate-fadeIn">
          <div className="text-xs font-semibold">
            {t.selectedCount ? t.selectedCount.replace('{count}', String(selectedPaths.length)) : `${selectedPaths.length} selected`}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDownload}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t.download}</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.deleteSelected}</span>
            </button>
          </div>
        </div>
      )}

      {/* File Table Container with Drag & Drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border transition-all duration-200 bg-white dark:bg-[#121214] overflow-y-auto max-h-[calc(100vh-16rem)] md:max-h-[calc(100vh-14rem)] shadow-2xl ${
          isDragging
            ? 'border-blue-500 ring-4 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-900/20'
            : 'border-neutral-200 dark:border-white/10'
        }`}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 bg-blue-600/10 backdrop-blur-sm border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <UploadCloud className="h-12 w-12 text-blue-400 animate-bounce mb-2" />
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              {t.dropZoneText || 'فایل‌ها یا پوشه‌های خود را اینجا رها کنید (Drag & Drop)'}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              آپلود همزمان چند فایل و پوشه با حفظ ساختار
            </p>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] text-neutral-500 dark:text-gray-400 font-semibold border-b border-neutral-200 dark:border-white/10 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
              <tr>
                <th className="p-3.5 w-10 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedPaths.length === items.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.fileName}</th>
                <th className="p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.fileSize}</th>
                <th className="p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.permissions}</th>
                <th className="p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.modifiedAt}</th>
                <th className="p-3.5 text-right sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
              {items.map((item) => (
                <tr
                  key={item.path}
                  className={`hover:bg-neutral-50/80 dark:hover:bg-white/5 transition group ${
                    selectedPaths.includes(item.path) ? 'bg-blue-50/60 dark:bg-blue-900/15' : ''
                  }`}
                >
                  <td className="p-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selectedPaths.includes(item.path)}
                      onChange={() => handleToggleSelect(item.path)}
                      className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-3.5">
                    <button
                      onClick={() => handleOpenFile(item)}
                      className="flex items-center gap-2.5 font-medium text-neutral-800 dark:text-neutral-200 hover:text-blue-400 transition cursor-pointer"
                    >
                      {item.isDirectory ? (
                        <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : item.name.endsWith('.sh') || item.name.endsWith('.py') || item.name.endsWith('.js') ? (
                        <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                      )}
                      <span>{item.name}</span>
                    </button>
                  </td>
                  <td className="p-3.5 font-mono text-neutral-500 dark:text-gray-400">{item.isDirectory ? '-' : formatSize(item.size)}</td>
                  <td className="p-3.5 font-mono">
                    <span className="px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-gray-300">
                      {item.permissions}
                    </span>
                  </td>
                  <td className="p-3.5 text-neutral-500 dark:text-gray-400">
                    {new Date(item.modifiedAt).toLocaleDateString()} {new Date(item.modifiedAt).toLocaleTimeString()}
                  </td>
                  <td className="p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5 opacity-90">
                      {!item.isDirectory && (
                        <button
                          onClick={() => handleOpenFile(item)}
                          className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-blue-400 transition"
                          title={t.edit}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <a
                        href={`/api/files/download?path=${encodeURIComponent(item.path)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-emerald-400 transition"
                        title={t.download}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>

                      <button
                        onClick={() => setChmodItem({ path: item.path, mode: item.permissions })}
                        className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-amber-400 transition"
                        title={t.changePerms}
                      >
                        <Key className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => setRenameItem({ oldPath: item.path, newName: item.name })}
                        className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-purple-400 transition"
                        title={t.rename}
                      >
                        <File className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(item.path)}
                        className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-rose-400 transition"
                        title={t.delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2 font-mono">
                <FileCode className="h-4 w-4 text-emerald-500" />
                <span>{editingFile.path}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveFile}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{t.saveFile}</span>
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <textarea
              value={editingFile.content || ''}
              onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
              className="w-full flex-1 p-4 font-mono text-xs bg-neutral-950 text-neutral-100 border-none outline-none resize-none leading-relaxed"
              rows={20}
            />
          </div>
        </div>
      )}

      {/* Chmod Permissions Modal */}
      {chmodItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" />
              <span>{t.permissions}</span>
            </h3>
            <p className="text-xs text-neutral-500 font-mono break-all">{chmodItem.path}</p>
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Linux Numeric Mode (Chmod):</label>
              <input
                type="text"
                value={chmodItem.mode || ''}
                onChange={(e) => setChmodItem({ ...chmodItem, mode: e.target.value })}
                className="w-full mt-1.5 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 font-mono text-sm text-neutral-900 dark:text-neutral-100"
                placeholder="755 or 644"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setChmodItem(null)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleChmodSave}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition cursor-pointer"
              >
                {t.changePerms}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <File className="h-5 w-5 text-purple-500" />
              <span>{t.rename}</span>
            </h3>
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">New Name:</label>
              <input
                type="text"
                value={renameItem.newName || ''}
                onChange={(e) => setRenameItem({ ...renameItem, newName: e.target.value })}
                className="w-full mt-1.5 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 font-mono text-sm text-neutral-900 dark:text-neutral-100"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameItem(null)}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleRenameSave}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 transition cursor-pointer"
              >
                {t.rename}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct File Uploader Modal */}
      <DirectFileUploadModal
        token={token}
        lang={lang}
        isOpen={isDirectUploadModalOpen}
        onClose={() => setIsDirectUploadModalOpen(false)}
        onSuccess={() => fetchFiles(currentPath)}
        currentPath={currentPath}
      />
    </div>
  );
};
