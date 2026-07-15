/**
 * Cloudflare Worker for VoidDrop
 * Proxies content from Appwrite and renders it in a branded viewer page.
 * The Appwrite storage URL is NEVER exposed to the end user.
 */

function renderPage(title, bodyContent, extra = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — VoidDrop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #000;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    canvas#stars {
      position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none;
    }
    .container {
      position: relative; z-index: 1;
      width: 100%; max-width: 720px;
      padding: 2rem 1.5rem;
      display: flex; flex-direction: column; align-items: center;
      min-height: 100vh;
    }
    .brand {
      margin-top: 2rem; margin-bottom: 2rem; text-align: center;
    }
    .brand h1 {
      font-size: 2.5rem; font-weight: 100; letter-spacing: -0.02em;
    }
    .brand h1 span { font-weight: 500; }
    .brand p {
      font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.4em;
      opacity: 0.4; margin-top: 0.5rem;
    }
    .glass-card {
      background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.005) 100%);
      backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 40px 80px -20px rgba(0,0,0,0.8);
      border-radius: 2rem; padding: 2rem; width: 100%;
      animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(30px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .meta {
      display: flex; gap: 1.5rem; flex-wrap: wrap;
      margin-bottom: 1.5rem; padding-bottom: 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .meta-item {
      font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.15em; opacity: 0.5;
    }
    .meta-item strong {
      display: block; font-size: 0.8rem; opacity: 1; font-weight: 500;
      margin-top: 0.25rem; color: #fff;
    }
    .content-area {
      width: 100%; border-radius: 1rem; overflow: hidden;
    }
    .content-area pre {
      background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 1rem; padding: 1.5rem; font-size: 0.85rem;
      line-height: 1.7; white-space: pre-wrap; word-break: break-word;
      color: rgba(255,255,255,0.85); overflow-x: auto; max-height: 60vh;
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .content-area img, .content-area video, .content-area audio {
      width: 100%; border-radius: 1rem; display: block;
    }
    .content-area iframe {
      width: 100%; height: 70vh; border: none; border-radius: 1rem;
      background: #fff;
    }
    .actions {
      display: flex; gap: 0.75rem; margin-top: 1.5rem; width: 100%;
    }
    .btn {
      flex: 1; padding: 0.9rem 1.5rem; border-radius: 1rem;
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.15em;
      font-weight: 600; cursor: pointer; transition: all 0.3s;
      text-decoration: none; text-align: center; display: flex;
      align-items: center; justify-content: center; gap: 0.5rem;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05); color: #fff;
    }
    .btn:hover {
      background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3);
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .btn-primary {
      background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.25);
    }
    .error-icon {
      font-size: 3rem; margin-bottom: 1rem; opacity: 0.6;
    }
    .error-text {
      text-align: center; padding: 2rem 0;
    }
    .error-text h2 { font-size: 1.3rem; font-weight: 300; margin-bottom: 0.5rem; }
    .error-text p { font-size: 0.8rem; opacity: 0.5; }
    .copy-toast {
      position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
      background: rgba(255,255,255,0.15); backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.2); border-radius: 1rem;
      padding: 0.8rem 1.5rem; font-size: 0.75rem; opacity: 0;
      transition: opacity 0.3s; pointer-events: none; z-index: 100;
    }
    .copy-toast.show { opacity: 1; }
    ${extra}
  </style>
</head>
<body>
  <canvas id="stars"></canvas>
  <div class="container">
    <div class="brand">
      <h1>Void<span>Drop</span></h1>
      <p>Zero trace. Encrypted delivery.</p>
    </div>
    ${bodyContent}
  </div>
  <div class="copy-toast" id="toast">Link copied to clipboard</div>
  <script>
    // Security: Block DevTools and clear console
    setTimeout(console.clear, 100);
    ['log', 'warn', 'error', 'info', 'debug'].forEach(m => console[m] = () => {});
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('keydown', e => {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key)) || (e.metaKey && e.altKey && ['I','J','C'].includes(e.key))) {
        e.preventDefault(); return false;
      }
    });

    // Minimal starfield
    const c = document.getElementById('stars');
    const x = c.getContext('2d');
    let w, h;
    const stars = [];
    function resize() { w = c.width = innerWidth; h = c.height = innerHeight; }
    resize(); addEventListener('resize', resize);
    for (let i = 0; i < 200; i++) stars.push({ x: Math.random()*2000-500, y: Math.random()*2000-500, r: Math.random()*1.5+0.5, s: Math.random()*0.3+0.1 });
    function draw(t) {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
      for (const s of stars) {
        const a = 0.4 + 0.6 * Math.sin(t * 0.001 * s.s + s.x);
        x.beginPath(); x.arc(s.x % w, s.y % h, s.r, 0, Math.PI * 2);
        x.fillStyle = 'rgba(255,255,255,' + a * 0.8 + ')'; x.fill();
      }
      requestAnimationFrame(draw);
    }
    draw(0);

    function copyLink() {
      navigator.clipboard.writeText(location.href);
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2000);
    }
  </script>
</body>
</html>`;
}

function renderError(status, title, message) {
  const icons = { 401: '🔒', 404: '👻', 410: '💀', 500: '⚠️' };
  const body = `
    <div class="glass-card">
      <div class="error-text">
        <div class="error-icon">${icons[status] || '⚠️'}</div>
        <h2>${title}</h2>
        <p>${message}</p>
      </div>
    </div>`;
  return new Response(renderPage(title, body), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const frontendUrl = env.FRONTEND_URL || 'http://localhost:5173';

    // 1. Root redirect to the frontend workspace app
    if (path === '/' || path === '') {
      return Response.redirect(frontendUrl, 302);
    }
    if (path === '/favicon.ico' || path === '/robots.txt') {
      return new Response(null, { status: 404 });
    }

    // 2. Extract Custom URL Parts
    const pathParts = path.split('/').filter(Boolean);
    
    if (pathParts.length < 2 || pathParts.length > 3) {
      return renderError(400, 'Invalid URL', 'Expected /username/filename');
    }

    const username = pathParts[0];
    const filename = pathParts[1];
    const passwordParam = pathParts[2] || '';

    // 3. Environment Variable Check
    const endpoint = env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
    const projectId = env.APPWRITE_PROJECT_ID;
    const bucketId = env.APPWRITE_BUCKET_ID;
    const databaseId = env.APPWRITE_DATABASE_ID;
    const collectionId = env.APPWRITE_COLLECTION_ID;

    if (!projectId || !databaseId || !collectionId) {
      return renderError(500, 'Configuration Error', 'Missing server environment variables.');
    }

    // 4. Query Appwrite Database
    try {
      const q1 = JSON.stringify({ method: "equal", attribute: "username", values: [username] });
      const q2 = JSON.stringify({ method: "equal", attribute: "filename", values: [filename] });
      
      const dbUrl = new URL(`${endpoint}/databases/${databaseId}/collections/${collectionId}/documents`);
      dbUrl.searchParams.append('queries[]', q1);
      dbUrl.searchParams.append('queries[]', q2);

      const dbRes = await fetch(dbUrl.toString(), {
        headers: {
          'X-Appwrite-Project': projectId,
          'Content-Type': 'application/json'
        }
      });

      if (!dbRes.ok) {
        const errText = await dbRes.text();
        console.error(`\n>>> APPWRITE ERROR: Status ${dbRes.status}\n>>> ${errText}\n`);
        return renderError(500, 'Database Error', 'Failed to query the drop database.');
      }

      const data = await dbRes.json();
      
      if (!data.documents || data.documents.length === 0) {
        return renderError(404, 'Drop Not Found', 'This drop does not exist or has been deleted.');
      }

      const drop = data.documents[0];
      const docId = drop.$id;

      // Helper: delete drop from DB + Storage (fire and forget)
      const cleanupDrop = (docId, fileId) => {
        // Delete DB document
        const deleteDocUrl = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${docId}`;
        const deleteDoc = fetch(deleteDocUrl, {
          method: 'DELETE',
          headers: { 'X-Appwrite-Project': projectId }
        }).catch(err => console.error("Cleanup DB delete failed:", err));

        // Delete storage file
        let deleteFile = Promise.resolve();
        if (fileId && bucketId) {
          const deleteFileUrl = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}`;
          deleteFile = fetch(deleteFileUrl, {
            method: 'DELETE',
            headers: { 'X-Appwrite-Project': projectId }
          }).catch(err => console.error("Cleanup storage delete failed:", err));
        }

        return Promise.all([deleteDoc, deleteFile]);
      };

      // 5. Enforce Expiry
      if (drop.expiresAt && new Date(drop.expiresAt) < new Date()) {
        ctx.waitUntil(cleanupDrop(docId, drop.fileId));
        return renderError(410, 'Drop Expired', 'This drop has self-destructed and been permanently deleted.');
      }

      // 6. Enforce View Limits
      if (drop.maxViews !== null && drop.maxViews > 0 && drop.currentViews >= drop.maxViews) {
        ctx.waitUntil(cleanupDrop(docId, drop.fileId));
        return renderError(410, 'View Limit Reached', 'This drop has reached its maximum views and been permanently deleted.');
      }

      // 7. Password Protection
      if (drop.password && drop.password !== passwordParam) {
        return renderError(401, 'Access Denied', 'This drop is password protected. Include the password in the URL.');
      }

      // 8. Increment View Count
      const updateUrl = `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents/${docId}`;
      ctx.waitUntil(
        fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'X-Appwrite-Project': projectId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: { currentViews: (drop.currentViews || 0) + 1 }
          })
        }).catch(err => console.error("Failed to increment views:", err))
      );

      // 9. Fetch file from Appwrite (server-side proxy)
      const fileId = drop.fileId;
      const appwriteViewUrl = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view?project=${projectId}`;
      const appwriteDownloadUrl = `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/download?project=${projectId}`;

      // Support ?raw=true for API consumers
      const isRaw = url.searchParams.get('raw') === 'true';
      // Support ?download=true for direct download
      const isDownload = url.searchParams.get('download') === 'true';

      if (isRaw || isDownload) {
        const targetUrl = isDownload ? appwriteDownloadUrl : appwriteViewUrl;
        const response = await fetch(targetUrl);
        if (!response.ok) return renderError(502, 'Fetch Error', 'Failed to retrieve the file from storage.');
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const fileData = await response.arrayBuffer();
        const headers = {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        };
        if (isDownload) {
          headers['Content-Disposition'] = `attachment; filename="${drop.originalName || filename}"`;
        }
        return new Response(fileData, { status: 200, headers });
      }

      // 10. Fetch file for viewer
      const fileResponse = await fetch(appwriteViewUrl);
      if (!fileResponse.ok) {
        return renderError(502, 'Fetch Error', 'Failed to retrieve the file from storage.');
      }

      const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
      const originalName = drop.originalName || filename;
      const viewCount = (drop.currentViews || 0) + 1;
      const maxViews = drop.maxViews;
      const currentUrl = url.toString();

      // Build metadata bar
      const metaHtml = `
        <div class="meta">
          <div class="meta-item">File<strong>${originalName}</strong></div>
          <div class="meta-item">Path<strong>/${username}/${filename}</strong></div>
          <div class="meta-item">Views<strong>${viewCount}${maxViews ? ' / ' + maxViews : ''}</strong></div>
          ${drop.expiresAt ? `<div class="meta-item">Expires<strong>${new Date(drop.expiresAt).toLocaleDateString()}</strong></div>` : ''}
        </div>`;

      // Build actions bar
      const actionsHtml = `
        <div class="actions">
          <a href="${currentUrl}${currentUrl.includes('?') ? '&' : '?'}download=true" class="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </a>
          <button onclick="copyLink()" class="btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy Link
          </button>
        </div>`;

      let contentHtml = '';

      // Text content (plain text, markdown, code, json, xml, csv, html)
      if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript')) {
        const text = await fileResponse.text();
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        contentHtml = `<div class="content-area"><pre>${escaped}</pre></div>`;
      }
      // Images
      else if (contentType.startsWith('image/')) {
        contentHtml = `<div class="content-area"><img src="${currentUrl}${currentUrl.includes('?') ? '&' : '?'}raw=true" alt="${originalName}" /></div>`;
      }
      // Video
      else if (contentType.startsWith('video/')) {
        contentHtml = `<div class="content-area"><video controls autoplay><source src="${currentUrl}?raw=true" type="${contentType}">Your browser does not support video.</video></div>`;
      }
      // Audio
      else if (contentType.startsWith('audio/')) {
        contentHtml = `<div class="content-area"><audio controls autoplay style="width:100%"><source src="${currentUrl}?raw=true" type="${contentType}"></audio></div>`;
      }
      // PDF
      else if (contentType === 'application/pdf') {
        contentHtml = `<div class="content-area"><iframe src="${currentUrl}?raw=true"></iframe></div>`;
      }
      // Generic binary file - just show download
      else {
        contentHtml = `
          <div class="error-text" style="padding: 1.5rem 0;">
            <div class="error-icon">📦</div>
            <h2>${originalName}</h2>
            <p style="margin-top: 0.5rem;">This file type cannot be previewed. Use the download button below.</p>
          </div>`;
      }

      const body = `
        <div class="glass-card">
          ${metaHtml}
          ${contentHtml}
          ${actionsHtml}
        </div>`;

      return new Response(renderPage(originalName, body), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });

    } catch (err) {
      console.error(`\n>>> WORKER EXCEPTION:\n>>> ${err.message}\n>>> ${err.stack}\n`);
      return renderError(500, 'Server Error', err.message);
    }
  }
};
