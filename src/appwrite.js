import { Client, Account, Storage, Databases, ID, Query, OAuthProvider } from 'appwrite';

class AppwriteService {
  constructor() {
    this.client = new Client();
    this.account = null;
    this.storage = null;
    this.databases = null;
    this.config = {
      endpoint: '',
      projectId: '',
      bucketId: '',
      databaseId: '',
      collectionId: '',
      workerUrl: ''
    };
    this.isConfigured = false;
  }

  loadConfig() {
    this.configure(
      import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
      import.meta.env.VITE_APPWRITE_PROJECT_ID || '',
      import.meta.env.VITE_APPWRITE_BUCKET_ID || '',
      import.meta.env.VITE_APPWRITE_DATABASE_ID || '',
      import.meta.env.VITE_APPWRITE_COLLECTION_ID || '',
      import.meta.env.VITE_WORKER_URL || ''
    );
  }

  configure(endpoint, projectId, bucketId, databaseId, collectionId, workerUrl) {
    this.config = { endpoint, projectId, bucketId, databaseId, collectionId, workerUrl };
    
    if (!endpoint || !projectId || !bucketId) {
      this.isConfigured = false;
      this.account = null;
      this.storage = null;
      this.databases = null;
      return false;
    }

    try {
      this.client = new Client()
        .setEndpoint(endpoint)
        .setProject(projectId);
      
      this.account = new Account(this.client);
      this.storage = new Storage(this.client);
      this.databases = new Databases(this.client);
      this.isConfigured = true;
      
      // Save config to localStorage
      localStorage.setItem('voiddrop_appwrite_config_v2', JSON.stringify(this.config));
      return true;
    } catch (e) {
      console.error("Failed to initialize Appwrite client:", e);
      this.isConfigured = false;
      return false;
    }
  }

  // --- AUTHENTICATION ---

  async getSession() {
    if (!this.isConfigured) throw new Error("Not configured.");
    try {
      return await this.account.get();
    } catch (e) {
      return null;
    }
  }

  async login(email, password) {
    if (!this.isConfigured) throw new Error("Not configured.");
    await this.account.createEmailPasswordSession(email, password);
    return await this.getSession();
  }

  async loginWithGoogle() {
    if (!this.isConfigured) throw new Error("Not configured.");
    // Appwrite redirects the window directly, so we pass current URL for redirect back
    const currentUrl = window.location.href;
    await this.account.createOAuth2Session(
      OAuthProvider.Google,
      currentUrl,
      currentUrl
    );
  }

  async register(username, email, password) {
    if (!this.isConfigured) throw new Error("Not configured.");
    // Create user
    await this.account.create(ID.unique(), email, password, username);
    // Auto-login
    return await this.login(email, password);
  }

  async logout() {
    if (!this.isConfigured) return;
    try {
      await this.account.deleteSession('current');
    } catch (e) {
      console.error(e);
    }
  }

  // --- STORAGE & DATABASE ---

  async uploadFile(file) {
    if (!this.isConfigured) throw new Error("Not configured.");
    return await this.storage.createFile(
      this.config.bucketId,
      ID.unique(),
      file
    );
  }

  async createDropMapping(username, filename, password, fileId, originalName, size, expiresAt = null, maxViews = null) {
    if (!this.isConfigured || !this.config.databaseId || !this.config.collectionId) {
      throw new Error("Database routing not configured. Drop will only use raw file ID.");
    }
    
    const payload = {
      username,
      filename,
      password: password || '',
      fileId,
      originalName,
      size: size.toString(),
      currentViews: 0
    };

    if (expiresAt) {
      payload.expiresAt = new Date(expiresAt).toISOString();
    }
    if (maxViews) {
      payload.maxViews = parseInt(maxViews);
    }

    // Create database document mapping the custom URL
    return await this.databases.createDocument(
      this.config.databaseId,
      this.config.collectionId,
      ID.unique(),
      payload
    );
  }

  async checkCustomFilenameExists(username, filename) {
    if (!this.isConfigured || !this.config.databaseId) return false;
    try {
      const result = await this.databases.listDocuments(
        this.config.databaseId,
        this.config.collectionId,
        [
          Query.equal('username', username),
          Query.equal('filename', filename)
        ]
      );
      return result.total > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Helper to construct URLs
   */
  getFilePreviewUrl(fileId) {
    if (!this.isConfigured) return '';
    return `${this.config.endpoint}/storage/buckets/${this.config.bucketId}/files/${fileId}/view?project=${this.config.projectId}`;
  }

  getShortUrl(username, filename, password) {
    if (this.config.workerUrl && username && filename) {
      const base = this.config.workerUrl.replace(/\/$/, "");
      if (password) {
        return `${base}/${username}/${filename}/${encodeURIComponent(password)}`;
      }
      return `${base}/${username}/${filename}`;
    }
    return '';
  }

  // --- HISTORY & SYNC ---

  /**
   * Fetch all drops for a given username from the database
   */
  async listDropsByUser(username) {
    if (!this.isConfigured || !this.config.databaseId) return [];
    try {
      const result = await this.databases.listDocuments(
        this.config.databaseId,
        this.config.collectionId,
        [
          Query.equal('username', username),
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      );
      return result.documents || [];
    } catch (e) {
      console.error("Failed to list drops:", e);
      return [];
    }
  }

  /**
   * Delete a drop: removes DB document AND the storage file
   */
  async deleteDrop(documentId, fileId) {
    if (!this.isConfigured) throw new Error("Not configured.");
    
    // Delete DB document
    await this.databases.deleteDocument(
      this.config.databaseId,
      this.config.collectionId,
      documentId
    );

    // Delete storage file (fire and forget - may fail if already deleted)
    if (fileId) {
      try {
        await this.storage.deleteFile(this.config.bucketId, fileId);
      } catch (e) {
        console.warn("Storage file may already be deleted:", e.message);
      }
    }
  }

  /**
   * Migrate guest drops to a real user account.
   * Updates all documents with username='guest' to the new username.
   */
  async migrateGuestDrops(newUsername) {
    if (!this.isConfigured || !this.config.databaseId) return 0;
    try {
      const guestDrops = await this.databases.listDocuments(
        this.config.databaseId,
        this.config.collectionId,
        [
          Query.equal('username', 'guest'),
          Query.limit(100)
        ]
      );

      let migrated = 0;
      for (const doc of guestDrops.documents) {
        try {
          await this.databases.updateDocument(
            this.config.databaseId,
            this.config.collectionId,
            doc.$id,
            { username: newUsername }
          );
          migrated++;
        } catch (e) {
          console.warn("Failed to migrate drop:", doc.$id, e.message);
        }
      }
      return migrated;
    } catch (e) {
      console.error("Failed to migrate guest drops:", e);
      return 0;
    }
  }
}

export const appwriteService = new AppwriteService();
appwriteService.loadConfig();
