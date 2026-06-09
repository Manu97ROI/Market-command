// taskQueue.js
// Priority Queue System: Foreground-Tasks haben Vorrang, 
// Background-Tasks laufen rate-limited im Hintergrund

const PRIORITY = {
  FOREGROUND: 0,  // sofort (z.B. du klickst Deep Dive)
  BACKGROUND: 1   // langsam (z.B. ganze DB vorladen)
};

class TaskQueue {
  constructor(options = {}) {
    this.foregroundQueue = [];
    this.backgroundQueue = [];
    this.isProcessing = false;
    this.minDelayMs = options.minDelayMs || 1500; // Background: min 1.5s zwischen Calls
    this.lastBackgroundCall = 0;
    this.activeTasks = new Set();
    this.onProgress = options.onProgress || (() => {});
  }
  
  // Foreground Task: laeuft sofort, parallel erlaubt
  async runForeground(taskId, taskFn) {
    if (this.activeTasks.has(taskId)) return; // duplicate skip
    this.activeTasks.add(taskId);
    try {
      const result = await taskFn();
      return result;
    } finally {
      this.activeTasks.delete(taskId);
    }
  }
  
  // Background Task: wird in Queue eingereiht, rate-limited
  enqueueBackground(taskId, taskFn, metadata = {}) {
    if (this.activeTasks.has(taskId)) return;
    if (this.backgroundQueue.some(t => t.id === taskId)) return; // schon in Queue
    
    this.backgroundQueue.push({ id: taskId, fn: taskFn, metadata });
    this.processNext();
  }
  
  // Promote: ziehe einen Background-Task in den Vordergrund (wenn User Aktie auswaehlt)
  async promote(taskId, taskFn) {
    // Aus Background-Queue rausnehmen falls drin
    this.backgroundQueue = this.backgroundQueue.filter(t => t.id !== taskId);
    // Sofort als Foreground ausfuehren
    return this.runForeground(taskId, taskFn);
  }
  
  async processNext() {
    if (this.isProcessing) return;
    if (this.backgroundQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      while (this.backgroundQueue.length > 0) {
        // Rate limiting
        const elapsed = Date.now() - this.lastBackgroundCall;
        if (elapsed < this.minDelayMs) {
          await new Promise(r => setTimeout(r, this.minDelayMs - elapsed));
        }
        
        const task = this.backgroundQueue.shift();
        if (!task) continue;
        if (this.activeTasks.has(task.id)) continue;
        
        this.activeTasks.add(task.id);
        this.lastBackgroundCall = Date.now();
        
        try {
          await task.fn();
        } catch (err) {
          console.error("Background task failed:", task.id, err);
        } finally {
          this.activeTasks.delete(task.id);
        }
        
        this.onProgress({
          queueSize: this.backgroundQueue.length,
          lastCompleted: task.id,
          metadata: task.metadata
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  clear() {
    this.backgroundQueue = [];
  }
  
  getStatus() {
    return {
      backgroundQueueSize: this.backgroundQueue.length,
      activeTasks: this.activeTasks.size,
      isProcessing: this.isProcessing
    };
  }
}

// Singleton Instance
let queueInstance = null;
export const getTaskQueue = (options) => {
  if (!queueInstance) {
    queueInstance = new TaskQueue(options);
  }
  return queueInstance;
};

export { PRIORITY };
