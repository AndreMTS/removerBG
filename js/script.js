
class BackgroundRemover {
  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.history = [];
    this.baseWidth = 0;
    this.baseHeight = 0;
    this.image = new Image();
  }

  initializeElements() {
    this.upload = document.getElementById("upload");
    this.toleranceInput = document.getElementById("tolerance");
    this.toleranceValue = document.getElementById("toleranceValue");
    this.undoBtn = document.getElementById("undo");
    this.resetBtn = document.getElementById("reset");
    this.exportBtn = document.getElementById("export");
    this.originalCanvas = document.getElementById("originalCanvas");
    this.editCanvas = document.getElementById("editCanvas");
    this.editPreviewCanvas = document.getElementById("editPreviewCanvas");
    this.message = document.getElementById("message");

    this.originalCtx = this.originalCanvas.getContext("2d");
    this.editCtx = this.editCanvas.getContext("2d");
    this.editPreviewCtx = this.editPreviewCanvas.getContext("2d");
  }

  setupEventListeners() {
    this.upload.addEventListener("change", this.handleImageUpload.bind(this));
    this.toleranceInput.addEventListener("input", () => {
      this.toleranceValue.textContent = this.toleranceInput.value;
    });
    this.editCanvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.editCanvas.addEventListener("mouseleave", this.clearPreview.bind(this));
    this.editCanvas.addEventListener("click", this.handleCanvasClick.bind(this));
    this.undoBtn.addEventListener("click", this.undoLastAction.bind(this));
    this.resetBtn.addEventListener("click", this.resetImage.bind(this));
    this.exportBtn.addEventListener("click", this.exportImage.bind(this));
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.image.onload = () => this.prepareCanvases();
      this.image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  prepareCanvases() {
    const maxWidth = 500;
    this.baseWidth = this.image.width;
    this.baseHeight = this.image.height;

    // Redimensionar a imagem original para exibição
    if (this.baseWidth > maxWidth) {
      this.baseHeight = (maxWidth / this.baseWidth) * this.baseHeight;
      this.baseWidth = maxWidth;
    }

    // Definir o tamanho do canvas original
    this.originalCanvas.width = this.baseWidth;
    this.originalCanvas.height = this.baseHeight;
    this.originalCtx.drawImage(this.image, 0, 0, this.baseWidth, this.baseHeight);

    // Definir o tamanho do canvas de edição (2x maior)
    const editWidth = this.baseWidth * 2;
    const editHeight = this.baseHeight * 2;
    this.editCanvas.width = editWidth;
    this.editCanvas.height = editHeight;
    this.editPreviewCanvas.width = editWidth;
    this.editPreviewCanvas.height = editHeight;

    // Desenhar a imagem no canvas de edição (2x maior)
    this.editCtx.drawImage(this.image, 0, 0, editWidth, editHeight);
    this.saveState();
    this.message.textContent = "Click on the editable image to remove areas!";
  }

  saveState() {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.editCanvas.width;
    tempCanvas.height = this.editCanvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(this.editCanvas, 0, 0);
    this.history.push(tempCanvas.toDataURL());
    if (this.history.length > 10) this.history.shift();
  }

  floodFill(x, y, tolerance) {
    const imgData = this.editCtx.getImageData(0, 0, this.editCanvas.width, this.editCanvas.height);
    const pixels = imgData.data;
    const width = this.editCanvas.width;
    const height = this.editCanvas.height;

    const targetIndex = (y * width + x) * 4;
    const targetColor = {
      r: pixels[targetIndex],
      g: pixels[targetIndex + 1],
      b: pixels[targetIndex + 2],
      a: pixels[targetIndex + 3]
    };

    if (targetColor.a === 0) return;

    const stack = [[x, y]];
    const visited = new Set();

    while (stack.length > 0) {
      const [currentX, currentY] = stack.pop();
      const index = (currentY * width + currentX) * 4;

      if (
        currentX < 0 || currentX >= width ||
        currentY < 0 || currentY >= height ||
        visited.has(index)
      ) continue;

      visited.add(index);

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = pixels[index + 3];

      if (
        Math.abs(r - targetColor.r) <= tolerance &&
        Math.abs(g - targetColor.g) <= tolerance &&
        Math.abs(b - targetColor.b) <= tolerance &&
        a > 0
      ) {
        pixels[index + 3] = 0;
        stack.push([currentX + 1, currentY]);
        stack.push([currentX - 1, currentY]);
        stack.push([currentX, currentY + 1]);
        stack.push([currentX, currentY - 1]);
      }
    }

    this.editCtx.putImageData(imgData, 0, 0);
  }

  handleMouseMove(event) {
    if (!this.image.src || this.image.src === location.href) return;

    const rect = this.editCanvas.getBoundingClientRect();
    const x = Math.floor(event.clientX - rect.left);
    const y = Math.floor(event.clientY - rect.top);
    const tolerance = parseInt(this.toleranceInput.value);

    this.editPreviewCtx.clearRect(0, 0, this.editPreviewCanvas.width, this.editPreviewCanvas.height);
    const imgData = this.editCtx.getImageData(0, 0, this.editCanvas.width, this.editCanvas.height);
    const previewData = this.editPreviewCtx.createImageData(imgData.width, imgData.height);
    const pixels = imgData.data;
    const previewPixels = previewData.data;
    const width = this.editCanvas.width;

    if (x < 0 || x >= width || y < 0 || y >= this.editCanvas.height) return;

    const targetIndex = (y * width + x) * 4;
    const targetColor = {
      r: pixels[targetIndex],
      g: pixels[targetIndex + 1],
      b: pixels[targetIndex + 2]
    };

    const stack = [[x, y]];
    const visited = new Set();

    while (stack.length > 0) {
      const [currentX, currentY] = stack.pop();
      const index = (currentY * width + currentX) * 4;

      if (
        currentX < 0 || currentX >= width ||
        currentY < 0 || currentY >= this.editCanvas.height ||
        visited.has(index)
      ) continue;

      visited.add(index);

      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = pixels[index + 3];

      if (
        Math.abs(r - targetColor.r) <= tolerance &&
        Math.abs(g - targetColor.g) <= tolerance &&
        Math.abs(b - targetColor.b) <= tolerance &&
        a > 0
      ) {
        previewPixels[index] = 255;
        previewPixels[index + 1] = 0;
        previewPixels[index + 2] = 0;
        previewPixels[index + 3] = 128;
        stack.push([currentX + 1, currentY]);
        stack.push([currentX - 1, currentY]);
        stack.push([currentX, currentY + 1]);
        stack.push([currentX, currentY - 1]);
      }
    }

    this.editPreviewCtx.putImageData(previewData, 0, 0);
  }

  clearPreview() {
    this.editPreviewCtx.clearRect(0, 0, this.editPreviewCanvas.width, this.editPreviewCanvas.height);
  }

  handleCanvasClick(event) {
    if (!this.image.src || this.image.src === location.href) return;

    const rect = this.editCanvas.getBoundingClientRect();
    const x = Math.floor(event.clientX - rect.left);
    const y = Math.floor(event.clientY - rect.top);
    const tolerance = parseInt(this.toleranceInput.value);

    if (x < 0 || x >= this.editCanvas.width || y < 0 || y >= this.editCanvas.height) return;

    this.saveState();
    this.floodFill(x, y, tolerance);
    this.message.textContent = "Area removed!";
    this.editPreviewCtx.clearRect(0, 0, this.editPreviewCanvas.width, this.editPreviewCanvas.height);
  }

  undoLastAction() {
    if (this.history.length > 1) {
      this.history.pop();
      const lastState = new Image();
      lastState.onload = () => {
        this.editCtx.clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
        this.editCtx.drawImage(lastState, 0, 0);
        this.message.textContent = "Last action undone!";
      };
      lastState.src = this.history[this.history.length - 1];
    } else {
      this.message.textContent = "Nothing to undo!";
    }
  }

  resetImage() {
    if (!this.image.src || this.image.src === location.href) return;
    this.editCtx.clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
    this.editCtx.drawImage(this.image, 0, 0, this.editCanvas.width, this.editCanvas.height);
    this.history = [this.editCanvas.toDataURL()];
    this.message.textContent = "Image reset!";
  }

  exportImage() {
    if (!this.image.src || this.image.src === location.href) {
      this.message.textContent = "No image to export!";
      return;
    }
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = this.editCanvas.width;
    exportCanvas.height = this.editCanvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    exportCtx.drawImage(this.editCanvas, 0, 0);
    const link = document.createElement("a");
    link.download = "transparent_image.png";
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
    this.message.textContent = "Image exported as PNG!";
  }

  // Initialize the app
  static init() {
    return new BackgroundRemover();
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', BackgroundRemover.init);
