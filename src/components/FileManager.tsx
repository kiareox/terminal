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
  GitCommit,
  Database,
  CornerUpLeft,
  Plus,
  Play,
  Terminal,
  Code2,
  CheckCircle2,
  AlertCircle,
  Edit3
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
  const [currentPath, setCurrentPath] = useState<string>('');
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
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isNewFileModalOpen, setIsNewFileModalOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Database Viewer Modal States
  const [viewingDbFile, setViewingDbFile] = useState<{ path: string } | null>(null);
  const [dbTables, setDbTables] = useState<string[]>([]);
  const [selectedDbTable, setSelectedDbTable] = useState<string>('');
  const [dbTableData, setDbTableData] = useState<{ columns: { name: string; type: string }[]; rows: any[] } | null>(null);
  const [dbLoading, setDbLoading] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // SQLite Editor & SQL Console States
  const [dbMode, setDbMode] = useState<'table' | 'sql'>('table');
  const [customSql, setCustomSql] = useState<string>('');
  const [isSqlExecuting, setIsSqlExecuting] = useState<boolean>(false);
  const [sqlResult, setSqlResult] = useState<{ success: boolean; changes?: number; rows?: any[]; columns?: { name: string }[]; error?: string } | null>(null);
  const [editingDbRow, setEditingDbRow] = useState<{ isNew: boolean; rowData: Record<string, any>; originalRow?: Record<string, any> } | null>(null);
  const [deletingDbRow, setDeletingDbRow] = useState<Record<string, any> | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [isDeletingLoading, setIsDeletingLoading] = useState<boolean>(false);

  const refetchDbTableData = async () => {
    if (!viewingDbFile) return;
    setDbLoading(true);
    setDbError(null);
    try {
      if (selectedDbTable) {
        const res = await fetch(`/api/sqlite/table-data?path=${encodeURIComponent(viewingDbFile.path)}&table=${encodeURIComponent(selectedDbTable)}`, {
          headers: { 'x-auth-token': token || '' }
        });
        if (res.ok) {
          const data = await res.json();
          setDbTableData(data);
        }
      }
      const tablesRes = await fetch(`/api/sqlite/tables?path=${encodeURIComponent(viewingDbFile.path)}`, {
        headers: { 'x-auth-token': token || '' }
      });
      if (tablesRes.ok) {
        const tablesData = await tablesRes.json();
        setDbTables(tablesData.tables || []);
      }
    } catch (e: any) {
      setDbError(e.message || 'Error refreshing table');
    } finally {
      setDbLoading(false);
    }
  };

  const handleExecuteCustomSql = async (sqlToRun?: string) => {
    const query = sqlToRun || customSql;
    if (!viewingDbFile || !query.trim()) return;
    setIsSqlExecuting(true);
    setSqlResult(null);
    try {
      const res = await fetch('/api/sqlite/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({
          dbPath: viewingDbFile.path,
          sql: query
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSqlResult({
          success: true,
          changes: data.changes,
          rows: data.rows,
          columns: data.columns
        });
        refetchDbTableData();
      } else {
        setSqlResult({
          success: false,
          error: data.error || 'Failed to execute query'
        });
      }
    } catch (e: any) {
      setSqlResult({
        success: false,
        error: e.message || 'Error executing query'
      });
    } finally {
      setIsSqlExecuting(false);
    }
  };

  const confirmDeleteDbRow = async () => {
    if (!viewingDbFile || !selectedDbTable || !dbTableData || !deletingDbRow) return;
    setIsDeletingLoading(true);
    setRowActionError(null);

    const whereParts: string[] = [];
    const params: any[] = [];
    dbTableData.columns.forEach(col => {
      const val = deletingDbRow[col.name];
      if (val === null || val === undefined) {
        whereParts.push(`"${col.name}" IS NULL`);
      } else {
        whereParts.push(`"${col.name}" = ?`);
        params.push(val);
      }
    });

    const sql = `DELETE FROM "${selectedDbTable}" WHERE ${whereParts.join(' AND ')}`;
    try {
      const res = await fetch('/api/sqlite/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({
          dbPath: viewingDbFile.path,
          sql,
          params
        })
      });
      if (res.ok) {
        setDeletingDbRow(null);
        refetchDbTableData();
      } else {
        const err = await res.json();
        setRowActionError(err.error || 'Failed to delete row');
      }
    } catch (e: any) {
      setRowActionError(e.message || 'Error deleting row');
    } finally {
      setIsDeletingLoading(false);
    }
  };

  const handleSaveDbRow = async () => {
    if (!viewingDbFile || !selectedDbTable || !editingDbRow || !dbTableData) return;
    setRowActionError(null);
    try {
      if (editingDbRow.isNew) {
        const colNames = dbTableData.columns.map(c => `"${c.name}"`);
        const placeholders = dbTableData.columns.map(() => '?');
        const params = dbTableData.columns.map(c => {
          const val = editingDbRow.rowData[c.name];
          return (val === '' || val === undefined) ? null : val;
        });

        const sql = `INSERT INTO "${selectedDbTable}" (${colNames.join(', ')}) VALUES (${placeholders.join(', ')})`;
        const res = await fetch('/api/sqlite/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': token || ''
          },
          body: JSON.stringify({
            dbPath: viewingDbFile.path,
            sql,
            params
          })
        });
        if (res.ok) {
          setEditingDbRow(null);
          refetchDbTableData();
        } else {
          const err = await res.json();
          setRowActionError(err.error || 'Failed to insert row');
        }
      } else {
        const setParts: string[] = [];
        const params: any[] = [];
        dbTableData.columns.forEach(col => {
          setParts.push(`"${col.name}" = ?`);
          const val = editingDbRow.rowData[col.name];
          params.push((val === '' || val === undefined) ? null : val);
        });

        const whereParts: string[] = [];
        dbTableData.columns.forEach(col => {
          const origVal = editingDbRow.originalRow?.[col.name];
          if (origVal === null || origVal === undefined) {
            whereParts.push(`"${col.name}" IS NULL`);
          } else {
            whereParts.push(`"${col.name}" = ?`);
            params.push(origVal);
          }
        });

        const sql = `UPDATE "${selectedDbTable}" SET ${setParts.join(', ')} WHERE ${whereParts.join(' AND ')}`;
        const res = await fetch('/api/sqlite/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': token || ''
          },
          body: JSON.stringify({
            dbPath: viewingDbFile.path,
            sql,
            params
          })
        });
        if (res.ok) {
          setEditingDbRow(null);
          refetchDbTableData();
        } else {
          const err = await res.json();
          setRowActionError(err.error || 'Failed to update row');
        }
      }
    } catch (e: any) {
      setRowActionError(e.message || 'Error saving row');
    }
  };

  // Fetch SQLite Table Data
  useEffect(() => {
    if (!viewingDbFile || !selectedDbTable) {
      setDbTableData(null);
      return;
    }
    const fetchTableData = async () => {
      setDbLoading(true);
      setDbError(null);
      try {
        const res = await fetch(`/api/sqlite/table-data?path=${encodeURIComponent(viewingDbFile.path)}&table=${encodeURIComponent(selectedDbTable)}`, {
          headers: { 'x-auth-token': token || '' }
        });
        if (res.ok) {
          const data = await res.json();
          setDbTableData(data);
        } else {
          const errData = await res.json();
          setDbError(errData.error || 'Failed to load table data');
        }
      } catch (e: any) {
        setDbError(e.message || 'Error loading table data');
      } finally {
        setDbLoading(false);
      }
    };
    fetchTableData();
  }, [selectedDbTable, viewingDbFile, token]);

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
    items.filter(item => selectedPaths.includes(item.path)).forEach((item, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = `/api/files/download?path=${encodeURIComponent(item.path)}&token=${encodeURIComponent(token || '')}`;
        a.download = item.isDirectory ? `${item.name}.zip` : item.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 1000);
      }, index * 300);
    });
  };

  const handleOpenFile = async (item: FileItem) => {
    if (item.isDirectory) {
      handleNavigate(item.path);
    } else if (
      item.path.toLowerCase().endsWith('.db') || 
      item.path.toLowerCase().endsWith('.sqlite') || 
      item.path.toLowerCase().endsWith('.sqlite3')
    ) {
      setViewingDbFile({ path: item.path });
      setDbTables([]);
      setSelectedDbTable('');
      setDbTableData(null);
      setDbError(null);
      setDbLoading(true);
      try {
        const res = await fetch(`/api/sqlite/tables?path=${encodeURIComponent(item.path)}`, {
          headers: { 'x-auth-token': token || '' }
        });
        if (res.ok) {
          const data = await res.json();
          setDbTables(data.tables || []);
          if (data.tables && data.tables.length > 0) {
            setSelectedDbTable(data.tables[0]);
          } else {
            setDbError(lang === 'fa' ? 'هیچ جدولی در این دیتابیس یافت نشد.' : 'No tables found in this database.');
          }
        } else {
          const errData = await res.json();
          setDbError(errData.error || 'Failed to read tables');
        }
      } catch (e: any) {
        setDbError(e.message || 'Error loading tables');
      } finally {
        setDbLoading(false);
      }
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
    if (!newFolderName) return;
    try {
      const dirPath = `${currentPath}/${newFolderName}`;
      await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ dirPath })
      });
      setNewFolderName('');
      setIsNewFolderModalOpen(false);
      fetchFiles(currentPath);
    } catch (e) {
      alert('Failed to create folder');
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName) return;
    try {
      const filePath = `${currentPath}/${newFileName}`;
      await fetch('/api/files/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ filePath })
      });
      setNewFileName('');
      setIsNewFileModalOpen(false);
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
          <div className="flex items-center gap-1.5 mt-1 font-mono text-xs text-neutral-600 dark:text-neutral-400 overflow-x-auto pb-1">
            {currentPath !== '/' && pathParts.length > 0 && (
              <button
                onClick={() => {
                  const parent = pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : '/';
                  handleNavigate(parent);
                }}
                title={lang === 'fa' ? 'بازگشت به پوشه قبلی' : 'Go to parent directory'}
                className="p-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition cursor-pointer flex items-center justify-center shrink-0 border border-neutral-300 dark:border-neutral-700"
              >
                <CornerUpLeft className="h-3.5 w-3.5 text-amber-500" />
              </button>
            )}
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
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 scrollbar-thin shrink-0 whitespace-nowrap">
          <button
            onClick={() => setIsDirectUploadModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/25"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            <span>{lang === 'fa' ? 'آپلود' : 'Upload'}</span>
          </button>

          <button
            onClick={() => setIsNewFolderModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-medium border border-neutral-300 dark:border-white/10 bg-white dark:bg-[#121214] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-800 dark:text-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <FolderPlus className="h-3.5 w-3.5 text-amber-500" />
            <span>{t.newFolder}</span>
          </button>

          <button
            onClick={() => setIsNewFileModalOpen(true)}
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
              onClick={() => setSelectedPaths([])}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-700 hover:bg-neutral-600 dark:bg-neutral-600 dark:hover:bg-neutral-500 transition flex items-center gap-1.5 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t.deselectAll || 'لغو انتخاب'}</span>
            </button>
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
                <th className="p-2.5 sm:p-3.5 w-8 sm:w-10 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedPaths.length === items.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="p-2.5 sm:p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.fileName}</th>
                <th className="p-2.5 sm:p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.fileSize}</th>
                <th className="p-2.5 sm:p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10 hidden sm:table-cell">{t.permissions}</th>
                <th className="p-2.5 sm:p-3.5 sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10 hidden md:table-cell">{t.modifiedAt}</th>
                <th className="p-2.5 sm:p-3.5 text-right sticky top-0 bg-neutral-100 dark:bg-[#1a1a1c] z-10">{t.actions}</th>
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
                  <td className="p-2.5 sm:p-3.5 w-8 sm:w-10">
                    <input
                      type="checkbox"
                      checked={selectedPaths.includes(item.path)}
                      onChange={() => handleToggleSelect(item.path)}
                      className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="p-2.5 sm:p-3.5 max-w-[140px] sm:max-w-none">
                    <button
                      onClick={() => handleOpenFile(item)}
                      className="flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200 hover:text-blue-400 transition cursor-pointer text-left truncate max-w-full"
                    >
                      {item.isDirectory ? (
                        <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : item.name.endsWith('.sh') || item.name.endsWith('.py') || item.name.endsWith('.js') ? (
                        <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-neutral-400 shrink-0" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </button>
                  </td>
                  <td className="p-2.5 sm:p-3.5 font-mono text-neutral-500 dark:text-gray-400 whitespace-nowrap">{item.isDirectory ? '-' : formatSize(item.size)}</td>
                  <td className="p-2.5 sm:p-3.5 font-mono hidden sm:table-cell">
                    <span className="px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-gray-300">
                      {item.permissions}
                    </span>
                  </td>
                  <td className="p-2.5 sm:p-3.5 text-neutral-500 dark:text-gray-400 hidden md:table-cell">
                    {new Date(item.modifiedAt).toLocaleDateString()} {new Date(item.modifiedAt).toLocaleTimeString()}
                  </td>
                  <td className="p-2.5 sm:p-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 sm:gap-1.5 opacity-90">
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
                        href={`/api/files/download?path=${encodeURIComponent(item.path)}&token=${encodeURIComponent(token || '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-emerald-400 transition"
                        title={t.download}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>

                      <button
                        onClick={() => setChmodItem({ path: item.path, mode: item.permissions })}
                        className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-amber-400 transition hidden sm:inline-flex"
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

      {/* New Folder Modal */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-amber-500" />
              <span>{t.newFolder}</span>
            </h3>
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t.createFolderPrompt}</label>
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                placeholder={lang === 'fa' ? 'مثال: src' : 'e.g. src'}
                className="w-full mt-1.5 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-amber-500/50"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setIsNewFolderModalOpen(false);
                  setNewFolderName('');
                }}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition cursor-pointer"
              >
                {t.newFolder}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New File Modal */}
      {isNewFileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-blue-500" />
              <span>{t.newFile}</span>
            </h3>
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{t.createFilePrompt}</label>
              <input
                type="text"
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFile();
                }}
                placeholder={lang === 'fa' ? 'مثال: index.html' : 'e.g. index.html'}
                className="w-full mt-1.5 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-sm text-neutral-900 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setIsNewFileModalOpen(false);
                  setNewFileName('');
                }}
                className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleCreateFile}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition cursor-pointer"
              >
                {t.newFile}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQLite Database Viewer & Editor Modal */}
      {viewingDbFile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-950/40">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2 font-mono">
                  <Database className="h-5 w-5 text-amber-500" />
                  <span>{viewingDbFile.path.split('/').pop()}</span>
                </h3>
                
                {/* Mode Tabs */}
                <div className="flex items-center bg-neutral-200 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-medium">
                  <button
                    onClick={() => setDbMode('table')}
                    className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                      dbMode === 'table'
                        ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm font-bold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Database className="h-3.5 w-3.5" />
                    <span>{lang === 'fa' ? 'جدول‌ها' : 'Tables'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setDbMode('sql');
                      if (!customSql && selectedDbTable) {
                        setCustomSql(`SELECT * FROM "${selectedDbTable}" LIMIT 50;`);
                      }
                    }}
                    className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                      dbMode === 'sql'
                        ? 'bg-white dark:bg-neutral-900 text-amber-500 shadow-sm font-bold'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    <span>{lang === 'fa' ? 'کنسول SQL' : 'SQL Console'}</span>
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setViewingDbFile(null);
                  setDbTables([]);
                  setSelectedDbTable('');
                  setDbTableData(null);
                  setDbError(null);
                  setEditingDbRow(null);
                  setSqlResult(null);
                }}
                className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              
              {/* Tables Sidebar (only in Table mode) */}
              {dbMode === 'table' && (
                <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-950/50 flex flex-col space-y-2 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                      {t.tables} ({dbTables.length})
                    </span>
                    <button
                      onClick={refetchDbTableData}
                      title={lang === 'fa' ? 'بروزرسانی' : 'Refresh'}
                      className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg text-neutral-500 transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="overflow-y-auto max-h-48 md:max-h-none flex-1 space-y-1 pr-1">
                    {dbTables.map((tableName) => (
                      <button
                        key={tableName}
                        onClick={() => setSelectedDbTable(tableName)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer ${
                          selectedDbTable === tableName
                            ? 'bg-amber-500 text-white shadow-md'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <Database className="h-3.5 w-3.5" />
                        <span className="truncate">{tableName}</span>
                      </button>
                    ))}
                    {dbTables.length === 0 && !dbLoading && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                        {t.noTables}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Data Table or SQL Console Area */}
              <div className="flex-1 overflow-hidden flex flex-col p-4 bg-white dark:bg-neutral-900">
                {dbMode === 'table' ? (
                  <>
                    {dbLoading && (
                      <div className="flex-1 flex flex-col items-center justify-center space-y-2 text-neutral-500">
                        <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                        <span className="text-xs font-medium">{t.loadingDb}</span>
                      </div>
                    )}

                    {dbError && (
                      <div className="flex-1 flex items-center justify-center p-4">
                        <p className="text-xs font-semibold text-red-500 bg-red-500/10 px-4 py-3 rounded-xl border border-red-500/20">
                          {dbError}
                        </p>
                      </div>
                    )}

                    {!dbLoading && !dbError && selectedDbTable && dbTableData && (
                      <div className="flex-1 overflow-hidden flex flex-col space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 rounded-lg font-mono">
                              {selectedDbTable}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {t.rowsCount.replace('{count}', dbTableData.rows.length.toString())}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const emptyRow: Record<string, any> = {};
                                dbTableData.columns.forEach(c => { emptyRow[c.name] = ''; });
                                setEditingDbRow({ isNew: true, rowData: emptyRow });
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>{lang === 'fa' ? 'افزودن ردیف' : 'Add Row'}</span>
                            </button>
                            <button
                              onClick={refetchDbTableData}
                              className="p-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition"
                              title={lang === 'fa' ? 'بازخوانی' : 'Refresh'}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-auto border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50 dark:bg-neutral-950/20">
                          <table className="w-full text-left border-collapse min-w-max">
                            <thead>
                              <tr className="bg-neutral-100 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 font-mono text-[11px] font-bold">
                                <th className="px-3 py-2.5 w-16 text-center font-bold">
                                  {lang === 'fa' ? 'عملیات' : 'Actions'}
                                </th>
                                {dbTableData.columns.map((col) => (
                                  <th key={col.name} className="px-4 py-2.5 font-bold">
                                    <div className="flex flex-col">
                                      <span>{col.name}</span>
                                      <span className="text-[9px] font-normal text-neutral-400 dark:text-neutral-500 uppercase">{col.type}</span>
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                              {dbTableData.rows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-neutral-100/50 dark:hover:bg-white/5 transition">
                                  {/* Action Buttons */}
                                  <td className="px-3 py-2 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => setEditingDbRow({ isNew: false, rowData: { ...row }, originalRow: { ...row } })}
                                        className="p-1 text-blue-500 hover:bg-blue-500/10 rounded-md transition cursor-pointer"
                                        title={lang === 'fa' ? 'ویرایش' : 'Edit'}
                                      >
                                        <Edit3 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRowActionError(null);
                                          setDeletingDbRow(row);
                                        }}
                                        className="p-1 text-red-500 hover:bg-red-500/10 rounded-md transition cursor-pointer"
                                        title={lang === 'fa' ? 'حذف' : 'Delete'}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                  {dbTableData.columns.map((col) => {
                                    const val = row[col.name];
                                    return (
                                      <td key={col.name} className="px-4 py-2 max-w-[250px]">
                                        <div className="overflow-x-auto whitespace-nowrap scrollbar-thin py-0.5" title={val !== null ? String(val) : 'NULL'}>
                                          {val === null ? (
                                            <span className="text-neutral-400 dark:text-neutral-600 italic">NULL</span>
                                          ) : typeof val === 'object' ? (
                                            JSON.stringify(val)
                                          ) : (
                                            String(val)
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                              {dbTableData.rows.length === 0 && (
                                <tr>
                                  <td colSpan={dbTableData.columns.length + 1} className="px-4 py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                                    {lang === 'fa' ? 'هیچ ردیفی یافت نشد' : 'No rows found'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {!selectedDbTable && !dbLoading && !dbError && (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                          {lang === 'fa' ? 'لطفا یک جدول انتخاب کنید' : 'Please select a table'}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  /* SQL Console View */
                  <div className="flex-1 overflow-hidden flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 font-mono">
                        <Terminal className="h-4 w-4 text-amber-500" />
                        <span>{lang === 'fa' ? 'ویرایش و اجرای دستورات SQL' : 'Execute Custom SQL Query'}</span>
                      </span>

                      {/* Snippets */}
                      <div className="flex items-center gap-1.5 text-[11px]">
                        {selectedDbTable && (
                          <>
                            <button
                              onClick={() => setCustomSql(`SELECT * FROM "${selectedDbTable}";`)}
                              className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-amber-500 hover:text-white transition text-neutral-600 dark:text-neutral-300 font-mono cursor-pointer"
                            >
                              SELECT
                            </button>
                            <button
                              onClick={() => setCustomSql(`UPDATE "${selectedDbTable}" SET column_name = 'value' WHERE id = 1;`)}
                              className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-amber-500 hover:text-white transition text-neutral-600 dark:text-neutral-300 font-mono cursor-pointer"
                            >
                              UPDATE
                            </button>
                            <button
                              onClick={() => setCustomSql(`DELETE FROM "${selectedDbTable}" WHERE id = 1;`)}
                              className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-amber-500 hover:text-white transition text-neutral-600 dark:text-neutral-300 font-mono cursor-pointer"
                            >
                              DELETE
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                      <textarea
                        value={customSql}
                        onChange={(e) => setCustomSql(e.target.value)}
                        placeholder={lang === 'fa' ? 'دستور SQL خود را وارد کنید... (مثلاً UPDATE, INSERT, DELETE, SELECT)' : 'Enter your SQL query here... (e.g. UPDATE, INSERT, DELETE, SELECT)'}
                        rows={4}
                        className="w-full p-3 font-mono text-xs bg-neutral-900 text-amber-400 rounded-xl border border-neutral-700 focus:outline-none focus:border-amber-500 resize-none"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleExecuteCustomSql()}
                          disabled={isSqlExecuting || !customSql.trim()}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
                        >
                          {isSqlExecuting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
                          <span>{lang === 'fa' ? 'اجرای کوئری' : 'Execute Query'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Query Result Output */}
                    <div className="flex-1 overflow-auto border border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50 dark:bg-neutral-950 p-3 flex flex-col">
                      {sqlResult === null && !isSqlExecuting && (
                        <p className="text-xs text-neutral-400 italic m-auto">
                          {lang === 'fa' ? 'نتایج کوئری در اینجا نمایش داده می‌شوند.' : 'Query results will be displayed here.'}
                        </p>
                      )}

                      {sqlResult && (
                        <div className="flex flex-col space-y-2">
                          {sqlResult.success ? (
                            <div className="p-2.5 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 rounded-xl text-xs font-mono flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <span>
                                {lang === 'fa'
                                  ? `کوئری با موفقیت اجرا شد. (تعداد تغییرات / ردیف‌ها: ${sqlResult.changes ?? 0})`
                                  : `Query executed successfully. (Affected rows/changes: ${sqlResult.changes ?? 0})`}
                              </span>
                            </div>
                          ) : (
                            <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-mono flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                              <span>{sqlResult.error}</span>
                            </div>
                          )}

                          {sqlResult.rows && sqlResult.rows.length > 0 && sqlResult.columns && (
                            <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
                              <table className="w-full text-left border-collapse font-mono text-[11px]">
                                <thead>
                                  <tr className="bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-800">
                                    {sqlResult.columns.map(col => (
                                      <th key={col.name} className="px-3 py-2 font-bold text-neutral-700 dark:text-neutral-300">
                                        {col.name}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                                  {sqlResult.rows.map((r, idx) => (
                                    <tr key={idx} className="hover:bg-neutral-100/50 dark:hover:bg-white/5">
                                      {sqlResult.columns!.map(col => (
                                        <td key={col.name} className="px-3 py-1.5 max-w-[200px] truncate">
                                          {r[col.name] !== null ? String(r[col.name]) : 'NULL'}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Row Edit / Insert Overlay Modal */}
            {editingDbRow && dbTableData && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
                    <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-2 font-mono">
                      <Edit3 className="h-4 w-4 text-amber-500" />
                      <span>
                        {editingDbRow.isNew
                          ? (lang === 'fa' ? 'افزودن ردیف جدید' : 'Add New Row')
                          : (lang === 'fa' ? 'ویرایش ردیف' : 'Edit Row')}
                      </span>
                    </h4>
                    <button
                      onClick={() => {
                        setEditingDbRow(null);
                        setRowActionError(null);
                      }}
                      className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg text-neutral-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {rowActionError && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-mono flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{rowActionError}</span>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {dbTableData.columns.map(col => (
                      <div key={col.name} className="flex flex-col space-y-1">
                        <label className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                          <span>{col.name}</span>
                          <span className="text-[10px] text-neutral-400 font-normal uppercase">{col.type}</span>
                        </label>
                        <input
                          type="text"
                          value={editingDbRow.rowData[col.name] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingDbRow(prev => prev ? {
                              ...prev,
                              rowData: { ...prev.rowData, [col.name]: val }
                            } : null);
                          }}
                          className="w-full px-3 py-2 text-xs font-mono bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:border-amber-500 text-neutral-800 dark:text-neutral-200"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 border-t border-neutral-200 dark:border-neutral-800 pt-3">
                    <button
                      onClick={() => {
                        setEditingDbRow(null);
                        setRowActionError(null);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={handleSaveDbRow}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{t.save}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Row Delete Confirmation Overlay Modal */}
            {deletingDbRow && dbTableData && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 w-full max-w-md flex flex-col shadow-2xl space-y-4">
                  <div className="flex items-center gap-3 text-red-500">
                    <div className="p-2.5 bg-red-500/10 rounded-full">
                      <Trash2 className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                        {lang === 'fa' ? 'تایید حذف ردیف' : 'Confirm Row Deletion'}
                      </h4>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {lang === 'fa' ? 'آیا از حذف این ردیف از جدول اطمینان دارید؟ این عمل غیرقابل بازگشت است.' : 'Are you sure you want to delete this row? This action cannot be undone.'}
                      </p>
                    </div>
                  </div>

                  {rowActionError && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-mono flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{rowActionError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                    <button
                      onClick={() => {
                        setDeletingDbRow(null);
                        setRowActionError(null);
                      }}
                      disabled={isDeletingLoading}
                      className="px-4 py-2 rounded-xl text-xs font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={confirmDeleteDbRow}
                      disabled={isDeletingLoading}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      {isDeletingLoading ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>{lang === 'fa' ? 'حذف ردیف' : 'Delete Row'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

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
