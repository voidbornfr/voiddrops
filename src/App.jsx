import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import { Settings, Copy, Check, CloudUpload, X, User, LogOut, Menu, Trash2, History, AlertTriangle, ChevronDown, Share2, Download } from 'lucide-react';
import { appwriteService } from './appwrite';
import GalaxyBackground from './GalaxyBackground';

export default function App() {
  const [config, setConfig] = useState(appwriteService.config);
  
  // App states
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('text');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState([]);
  
  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // Auth Form State
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Input states
  const [textPaste, setTextPaste] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]); 
  
  // Custom URL fields
  const [customFilename, setCustomFilename] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [expirySelection, setExpirySelection] = useState('24h');
  const [maxViews, setMaxViews] = useState('');
  
  // QR Customization
  const [qrFgColor, setQrFgColor] = useState('#ffffff');
  const [qrBgColor, setQrBgColor] = useState('#000000');
  const [qrSize, setQrSize] = useState(180);
  const [qrLevel, setQrLevel] = useState('H');
  const qrRef = useRef(null);
  
  // Operation states
  const [uploading, setUploading] = useState(false);
  const [recentUpload, setRecentUpload] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);
  
  const fileInputRef = useRef(null);

  useEffect(() => {
    appwriteService.loadConfig();
    setConfig(appwriteService.config);
    initSession();
  }, []);

  // Load history from Appwrite DB for a given username
  const loadHistoryFromDB = async (username) => {
    try {
      const docs = await appwriteService.listDropsByUser(username);
      const mapped = docs.map(doc => ({
        id: doc.$id,
        fileId: doc.fileId,
        shortUrl: appwriteService.getShortUrl(doc.username, doc.filename, doc.password),
        username: doc.username,
        filename: doc.filename,
        originalName: doc.originalName || doc.filename,
        date: new Date(doc.$createdAt).toLocaleDateString(),
      }));
      setHistory(mapped);
    } catch (e) {
      console.error('Failed to load history from DB:', e);
      // Fallback to localStorage
      const savedHistory = localStorage.getItem('voiddrop_history_v2');
      if (savedHistory) {
        try { setHistory(JSON.parse(savedHistory)); } catch (e) {}
      }
    }
  };

  const initSession = async () => {
    if (!appwriteService.isConfigured) return;
    const currentSession = await appwriteService.getSession();
    setUser(currentSession);
    if (currentSession) {
      await loadHistoryFromDB(currentSession.name);
    } else {
      // Load guest history from localStorage as fallback
      const savedHistory = localStorage.getItem('voiddrop_history_v2');
      if (savedHistory) {
        try { setHistory(JSON.parse(savedHistory)); } catch (e) {}
      }
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      let u;
      if (isLoginView) {
        u = await appwriteService.login(authEmail, authPassword);
      } else {
        if (!authUsername.trim()) throw new Error("Username required");
        const cleanUsername = authUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
        u = await appwriteService.register(cleanUsername, authEmail, authPassword);
      }
      setUser(u);

      // Migrate guest drops to this user's account
      const migrated = await appwriteService.migrateGuestDrops(u.name);
      if (migrated > 0) {
        console.log(`Migrated ${migrated} guest drops to @${u.name}`);
      }
      localStorage.removeItem('voiddrop_guest_count');
      localStorage.removeItem('voiddrop_history_v2');

      // Reload history from DB (now includes migrated guest drops)
      await loadHistoryFromDB(u.name);

      setShowAuthModal(false);
    } catch (err) {
      setAlertMessage(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await appwriteService.logout();
    setUser(null);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const calculateTotalSize = () => {
    return selectedFiles.reduce((acc, file) => acc + file.size, 0);
  };

  const handleGenerateLink = async () => {
    const guestDrops = parseInt(localStorage.getItem('voiddrop_guest_count') || '0');
    if (!user && guestDrops >= 1) {
      setAlertMessage("Guest limit reached. You can only generate 1 drop without an account. Please connect to continue.");
      return setShowAuthModal(true);
    }

    if (!customFilename.trim()) return setAlertMessage("Custom Path/Filename is required.");

    setUploading(true);
    
    try {
      let fileToUpload = null;
      let size = 0;
      let originalName = "";
      const cleanFilename = customFilename.toLowerCase().replace(/[^a-z0-9-_]/g, '');

      if (activeTab === 'text') {
        if (!textPaste.trim()) throw new Error("Text payload required.");
        const extension = cleanFilename.includes('.') ? '' : '.md';
        fileToUpload = new File([textPaste], cleanFilename + extension, { type: 'text/markdown;charset=utf-8' });
        originalName = cleanFilename + extension;
        size = fileToUpload.size;
      } else {
        if (selectedFiles.length === 0) throw new Error("File(s) required.");
        
        if (selectedFiles.length === 1) {
          fileToUpload = selectedFiles[0];
          originalName = selectedFiles[0].name;
          size = selectedFiles[0].size;
        } else {
          const zip = new JSZip();
          for (let i = 0; i < selectedFiles.length; i++) {
            zip.file(selectedFiles[i].name, selectedFiles[i]);
          }
          const content = await zip.generateAsync({ type: 'blob' });
          fileToUpload = new File([content], cleanFilename + '.zip', { type: 'application/zip' });
          originalName = cleanFilename + '.zip';
          size = fileToUpload.size;
        }
      }

      if (!user && size > 10 * 1024 * 1024) {
        throw new Error("Guest uploads are limited to 10MB. Please connect to upload larger payloads.");
      }

      const finalUsername = user ? user.name : 'guest';
      const collision = await appwriteService.checkCustomFilenameExists(finalUsername, cleanFilename);
      if (collision) {
        if (!user) throw new Error(`The path '/guest/${cleanFilename}' is already taken by someone else. Please try a different one.`);
        else throw new Error(`You already have a drop at '/${finalUsername}/${cleanFilename}'. Please try a different path.`);
      }

      const response = await appwriteService.uploadFile(fileToUpload);
      
      let calculatedExpiry = null;
      if (expirySelection) {
        const hours = parseFloat(expirySelection);
        if (!isNaN(hours) && hours > 0) {
          const d = new Date();
          d.setHours(d.getHours() + hours);
          calculatedExpiry = d;
        }
      }

      const dbDoc = await appwriteService.createDropMapping(
        finalUsername, 
        cleanFilename, 
        accessPassword, 
        response.$id, 
        originalName, 
        size,
        calculatedExpiry,
        maxViews
      );

      const shortUrl = appwriteService.getShortUrl(finalUsername, cleanFilename, accessPassword);
      
      const uploadData = { 
        id: dbDoc.$id, 
        fileId: response.$id, 
        shortUrl, 
        username: finalUsername, 
        filename: cleanFilename, 
        originalName,
        date: new Date().toLocaleDateString() 
      };
      setRecentUpload(uploadData);
      
      // Add to history (prepend)
      setHistory(prev => [uploadData, ...prev]);
      // Also save to localStorage for guest fallback
      if (!user) {
        const newHistory = [uploadData, ...history].slice(0, 50);
        localStorage.setItem('voiddrop_history_v2', JSON.stringify(newHistory));
      }
      
      if (!user) {
        localStorage.setItem('voiddrop_guest_count', (guestDrops + 1).toString());
      }
      
      setTextPaste('');
      setSelectedFiles([]);
      setCustomFilename('');
      setAccessPassword('');
      setMaxViews('');
    } catch (err) {
      setAlertMessage(err.message);
    } finally {
      setUploading(false);
    }
  };

  const copyLink = async (url) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const shareLink = async (url) => {
    if (navigator.share) {
      try { await navigator.share({ title: 'VoidDrop', text: 'Access this encrypted drop:', url }); } catch (e) {}
    } else {
      await copyLink(url);
    }
  };

  const downloadQR = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;
    const canvas = document.createElement('canvas');
    const size = qrSize * 2;
    canvas.width = size; canvas.height = size;
    const cCtx = canvas.getContext('2d');
    const data = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      cCtx.fillStyle = qrBgColor;
      cCtx.fillRect(0, 0, size, size);
      cCtx.drawImage(img, 0, 0, size, size);
      const a = document.createElement('a');
      a.download = 'voiddrop-qr.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(data);
  };

  const copyHistoryLink = async (url, id) => {
    await navigator.clipboard.writeText(url);
    setCopiedHistoryId(id);
    setTimeout(() => setCopiedHistoryId(null), 2000);
  };

  const deleteHistoryItem = async (id) => {
    const item = history.find(h => h.id === id);
    try {
      if (item) {
        await appwriteService.deleteDrop(item.id, item.fileId);
      }
    } catch (e) {
      console.error('Failed to delete from DB:', e);
    }
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    if (!user) {
      localStorage.setItem('voiddrop_history_v2', JSON.stringify(newHistory));
    }
  };

  return (
    <div className="relative min-h-screen w-full flex overflow-x-hidden overflow-y-auto font-sans text-white">
      
      <GalaxyBackground />

      {/* LEFT SIDEBAR (History) */}
      <div 
        className={`fixed top-0 left-0 h-full glass-sidebar z-30 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${sidebarOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full shadow-none'}`}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-widest uppercase opacity-80 flex items-center gap-2 anim-slide-up delay-1">
            <History className="w-4 h-4" /> Drop History
          </h2>
          <button onClick={() => setSidebarOpen(false)} className="opacity-50 hover:opacity-100 transition-opacity anim-slide-up delay-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {history.length === 0 ? (
            <div className="glass-card p-8 flex flex-col items-center justify-center text-center mt-4 anim-slide-up delay-3 opacity-70" style={{ borderStyle: 'dashed' }}>
              <History className="w-8 h-8 mb-4 opacity-40" />
              <p className="text-xs uppercase tracking-widest font-medium opacity-90 mb-1">No Local History</p>
              <p className="text-[10px] opacity-50 uppercase tracking-[0.2em]">Drops appear here</p>
            </div>
          ) : (
            history.map((item, index) => (
              <div key={item.id} className={`glass-card p-5 group anim-slide-up relative overflow-hidden`} style={{animationDelay: `${0.2 + index * 0.05}s`}}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <div className="flex justify-between items-start mb-3 relative z-10">
                  <span className="text-sm font-semibold tracking-wide truncate block">{item.filename}</span>
                  <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => copyHistoryLink(item.shortUrl, item.id)} className="opacity-50 hover:opacity-100 hover:text-white transition-all transform hover:scale-110">
                      {copiedHistoryId === item.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteHistoryItem(item.id)} className="opacity-50 hover:opacity-100 text-red-400 hover:text-red-300 transition-all transform hover:scale-110">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="text-[9px] opacity-50 flex justify-between uppercase tracking-widest font-medium relative z-10">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> {item.username}</span>
                  <span>{item.date}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-white/10 anim-slide-up delay-6">
          <button 
            onClick={() => { setHistory([]); localStorage.removeItem('voiddrop_history_v2'); }}
            className="w-full py-3 text-center text-[10px] uppercase tracking-[0.2em] opacity-40 hover:opacity-100 hover:bg-white/5 rounded-xl transition-all text-red-400"
          >
            Clear History
          </button>
        </div>
      </div>

      {/* TOP NAVBAR */}
      <div className="absolute top-8 w-full px-8 flex justify-between items-center z-20">
        <div className="flex items-center gap-4 anim-slide-up delay-1">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-white/10 transition-all backdrop-blur-md"
          >
            <Menu className="w-4 h-4" />
          </button>
          <button 
            onClick={() => window.location.reload()} 
            className="hidden sm:block cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img src="/favicon.svg" alt="VoidDrop" className="h-6 w-auto" />
          </button>
        </div>
        
        <div className="flex items-center gap-6 anim-slide-up delay-2">
          {!user ? (
            <button onClick={() => setShowAuthModal(true)} className="text-xs uppercase tracking-[0.2em] opacity-50 hover:opacity-100 transition-opacity flex items-center gap-2">
              <User className="w-3 h-3" /> Connect
            </button>
          ) : (
            <div className="flex items-center gap-4 text-xs">
              <span className="opacity-40 uppercase tracking-widest hidden sm:inline">@{user.name}</span>
              <button onClick={handleLogout} className="opacity-50 hover:opacity-100 transition-opacity">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CENTERED WIDGET */}
      <main className={`flex-1 flex flex-col items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] z-10 px-4 py-20 min-h-screen ${sidebarOpen ? 'md:pl-80' : ''}`}>
        <div className="w-full max-w-lg">
          
          <div className="text-center mb-8">
            <h1 className="text-5xl font-extralight tracking-tight mb-3 anim-slide-up delay-1">
              Void<span className="font-medium opacity-100 text-white">Drop</span>
            </h1>
            <p className="text-[10px] opacity-40 uppercase tracking-[0.4em] anim-slide-up delay-2">Zero trace. Encrypted delivery.</p>
          </div>

          <div className="glass-panel p-8 relative overflow-hidden anim-slide-up delay-3">
            
            {uploading && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-xl z-30 flex flex-col items-center justify-center transition-all duration-500">
                <div className="w-8 h-8 rounded-full border border-white/20 border-t-white animate-spin mb-6" />
                <p className="text-[10px] uppercase tracking-widest opacity-60">Deploying Payload...</p>
              </div>
            )}

            {recentUpload ? (
              <div className="flex flex-col items-center py-4 anim-slide-up">
                
                <h3 className="font-semibold text-lg mb-1 tracking-wide anim-slide-up delay-1">Drop Secured</h3>
                <p className="text-[10px] opacity-40 mb-5 anim-slide-up delay-2">Scan to open instantly</p>

                {/* QR Code */}
                <div ref={qrRef} className="p-3 rounded-2xl mb-4 shadow-2xl transition-all duration-300 border border-white/10" style={{ backgroundColor: qrBgColor }}>
                  <QRCodeSVG 
                    value={recentUpload.shortUrl} 
                    size={qrSize} 
                    bgColor={qrBgColor} 
                    fgColor={qrFgColor} 
                    level={qrLevel} 
                    includeMargin={false}
                  />
                </div>
                
                {/* QR Customization Toolbar */}
                <div className="w-full glass-card p-4 mb-5 anim-slide-up delay-3">
                  <div className="flex items-center justify-center gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] uppercase tracking-widest opacity-40">QR</span>
                      <input type="color" value={qrFgColor} onChange={e => setQrFgColor(e.target.value)} className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 bg-transparent" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] uppercase tracking-widest opacity-40">BG</span>
                      <input type="color" value={qrBgColor} onChange={e => setQrBgColor(e.target.value)} className="w-5 h-5 rounded-full cursor-pointer border-0 p-0 bg-transparent" />
                    </div>
                    <div className="border-l border-white/10 pl-4 flex items-center gap-2">
                      <span className="text-[8px] uppercase tracking-widest opacity-40">EC</span>
                      <div className="flex gap-1">
                        {['L','M','Q','H'].map(l => (
                          <button key={l} onClick={() => setQrLevel(l)} className={`w-6 h-6 rounded-md text-[9px] font-bold transition-all ${
                            qrLevel === l ? 'bg-white/20 text-white border border-white/30' : 'bg-white/5 text-white/40 hover:bg-white/10'
                          }`}>{l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[8px] uppercase tracking-widest opacity-40 shrink-0">Size</span>
                    <input type="range" min="100" max="300" value={qrSize} onChange={e => setQrSize(Number(e.target.value))} className="flex-1 accent-white h-1 cursor-pointer" />
                    <span className="text-[9px] opacity-40 w-8 text-right">{qrSize}</span>
                  </div>
                </div>

                {/* Link + Share Actions */}
                <div className="w-full glass-card p-3 mb-5 anim-slide-up delay-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-light truncate opacity-70 flex-1">{recentUpload.shortUrl}</span>
                    <button onClick={() => copyLink(recentUpload.shortUrl)} className="p-2 rounded-lg hover:bg-white/10 transition-all opacity-60 hover:opacity-100" title="Copy Link">
                      {copiedUrl ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button onClick={() => shareLink(recentUpload.shortUrl)} className="p-2 rounded-lg hover:bg-white/10 transition-all opacity-60 hover:opacity-100" title="Share Link">
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button onClick={downloadQR} className="p-2 rounded-lg hover:bg-white/10 transition-all opacity-60 hover:opacity-100" title="Download QR">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button onClick={() => setRecentUpload(null)} className="text-[10px] opacity-40 hover:opacity-100 transition-opacity uppercase tracking-[0.2em] anim-slide-up delay-5">
                  Initialize New Drop
                </button>
              </div>
            ) : (
              <div className="anim-slide-up delay-4">
                {/* Tab Selector */}
                <div className="flex gap-8 mb-6 text-[10px] uppercase tracking-widest font-medium">
                  <button 
                    onClick={() => setActiveTab('text')}
                    className={`pb-2 transition-all duration-300 ${activeTab === 'text' ? 'text-white border-b border-white' : 'opacity-30 hover:opacity-60'}`}
                  >
                    Markdown
                  </button>
                  <button 
                    onClick={() => setActiveTab('file')}
                    className={`pb-2 transition-all duration-300 ${activeTab === 'file' ? 'text-white border-b border-white' : 'opacity-30 hover:opacity-60'}`}
                  >
                    File / Multiple
                  </button>
                </div>

                {/* Payload Area */}
                <div className="mb-6 anim-slide-up delay-5">
                  {activeTab === 'text' ? (
                    <textarea 
                      placeholder="Enter confidential text..."
                      rows={3}
                      value={textPaste}
                      onChange={(e) => setTextPaste(e.target.value)}
                      className="w-full glass-input resize-none"
                    />
                  ) : (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border border-dashed border-white/20 rounded-3xl py-12 text-center cursor-pointer hover:border-white/40 hover:bg-white/5 transition-all relative overflow-hidden"
                    >
                      <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                      
                      {selectedFiles.length > 0 ? (
                        <div className="anim-slide-up">
                          <p className="text-base font-medium opacity-90">{selectedFiles.length > 1 ? `${selectedFiles.length} files selected (Auto-Zip)` : selectedFiles[0].name}</p>
                          <p className="text-xs opacity-50 mt-2">{formatBytes(calculateTotalSize())}</p>
                        </div>
                      ) : (
                        <p className="text-sm font-light opacity-60 flex items-center justify-center gap-3 anim-slide-up">
                          <CloudUpload className="w-5 h-5 opacity-80" /> Click to attach file(s)
                        </p>
                      )}
                      
                      {!user && <div className="absolute top-4 right-5 text-[9px] text-red-300/80 uppercase tracking-widest font-medium">Max 10MB</div>}
                    </div>
                  )}
                </div>

                {/* Routing & Security Config */}
                <div className="space-y-5 mb-8 anim-slide-up delay-6">
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="flex-1">
                      <label className="block text-[9px] uppercase tracking-[0.2em] opacity-50 mb-2 pl-2">Path</label>
                      <div className="glass-input-container w-full">
                        <span className="text-xs opacity-50 pl-4 pr-3 py-[0.8rem] bg-black/20 border-r border-white/10 shrink-0 font-medium">
                          /{user ? user.name : 'guest'}/
                        </span>
                        <input 
                          type="text" 
                          value={customFilename}
                          onChange={(e) => setCustomFilename(e.target.value)}
                          placeholder="file"
                          className="flex-1 bg-transparent border-none outline-none text-sm px-4 py-[0.8rem] w-full"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[9px] uppercase tracking-[0.2em] opacity-50 mb-2 pl-2">Key (Optional)</label>
                      <input 
                        type="password" 
                        value={accessPassword}
                        onChange={(e) => setAccessPassword(e.target.value)}
                        placeholder="••••"
                        className="glass-input"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-5">
                    <div className="flex-1">
                      <label className="block text-[9px] uppercase tracking-[0.2em] opacity-50 mb-2 pl-2">Expiry (Hours)</label>
                      <input 
                        type="number" 
                        min="1"
                        step="any"
                        value={expirySelection}
                        onChange={(e) => setExpirySelection(e.target.value)}
                        placeholder="Never (Type hours)"
                        className="glass-input w-full"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[9px] uppercase tracking-[0.2em] opacity-50 mb-2 pl-2">Max Views (Opt)</label>
                      <input 
                        type="number" 
                        min="1"
                        value={maxViews}
                        onChange={(e) => setMaxViews(e.target.value)}
                        placeholder="Unlimited (Type number)"
                        className="glass-input w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="anim-slide-up delay-6">
                  <button 
                    onClick={handleGenerateLink}
                    className="py-4 text-xs uppercase tracking-[0.1em] glass-button"
                  >
                    Create Ghost Link
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* AUTHENTICATION MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-4 anim-slide-up">
          <div className="glass-panel p-12 max-w-sm w-full relative">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity">
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-2xl font-light mb-10 text-center tracking-wide">{isLoginView ? 'Welcome' : 'Join Void'}</h2>
            
            <form onSubmit={handleAuthSubmit} className="space-y-6">
              {!isLoginView && (
                <div className="anim-slide-up delay-1">
                  <input type="text" value={authUsername} onChange={e => setAuthUsername(e.target.value)} required placeholder="Username" className="glass-input" />
                </div>
              )}
              <div className="anim-slide-up delay-2">
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required placeholder="Email" className="glass-input" />
              </div>
              <div className="anim-slide-up delay-3">
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required placeholder="Password" className="glass-input tracking-widest" />
              </div>
              
              <div className="pt-4 anim-slide-up delay-4">
                <button type="submit" disabled={authLoading} className="py-4 text-xs uppercase tracking-widest glass-button">
                  {authLoading ? '...' : (isLoginView ? 'Log In' : 'Sign Up')}
                </button>
              </div>
            </form>
            
            <p className="text-center text-[10px] opacity-40 mt-10 uppercase tracking-[0.15em] anim-slide-up delay-5">
              <button type="button" onClick={() => setIsLoginView(!isLoginView)} className="hover:opacity-100 transition-opacity">
                {isLoginView ? 'Create Account' : 'Existing User Login'}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* CONFIG MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-4 anim-slide-up">
          <div className="glass-panel p-12 max-w-sm w-full relative">
            <button onClick={() => setShowConfigModal(false)} className="absolute top-6 right-6 opacity-40 hover:opacity-100 transition-opacity">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-light mb-10 text-center tracking-wide">Environment</h2>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              appwriteService.configure(config.endpoint, config.projectId, config.bucketId, config.databaseId, config.collectionId, config.workerUrl);
              setShowConfigModal(false);
            }} className="space-y-6">
              <div className="anim-slide-up delay-1"><input type="text" value={config.projectId} onChange={e => setConfig({...config, projectId: e.target.value})} placeholder="Project ID" className="glass-input" /></div>
              <div className="anim-slide-up delay-2"><input type="text" value={config.bucketId} onChange={e => setConfig({...config, bucketId: e.target.value})} placeholder="Bucket ID" className="glass-input" /></div>
              <div className="anim-slide-up delay-3"><input type="text" value={config.databaseId} onChange={e => setConfig({...config, databaseId: e.target.value})} placeholder="Database ID" className="glass-input" /></div>
              <div className="anim-slide-up delay-4"><input type="text" value={config.collectionId} onChange={e => setConfig({...config, collectionId: e.target.value})} placeholder="Collection ID" className="glass-input" /></div>
              <div className="pt-4 anim-slide-up delay-5"><button type="submit" className="py-4 text-xs uppercase tracking-widest glass-button">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM ALERT MODAL */}
      {alertMessage && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-4 anim-slide-up">
          <div className="glass-panel p-10 max-w-sm w-full relative text-center">
            <h2 className="text-xl font-light mb-6 tracking-wide text-white">Notice</h2>
            <p className="text-sm opacity-70 mb-8 leading-relaxed">
              {alertMessage}
            </p>
            <div className="anim-slide-up delay-1">
              <button 
                onClick={() => setAlertMessage(null)} 
                className="w-full py-4 text-xs uppercase tracking-widest glass-button"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
