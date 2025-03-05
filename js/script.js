class BackgroundRemover {
  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.history = [];
    this.baseWidth = 0;
    this.baseHeight = 0;
    this.image = new Image();
    this.zoomLevel = 1;
    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.brushSize = 20; // Tamanho do pincel para remoção mais precisa
    this.brushMode = false; // Modo de pincel manual
    this.historyIndex = 0;
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
    this.zoomInput = document.getElementById("zoom");
    this.zoomValue = document.getElementById("zoomValue");
    this.brushModeBtn = document.getElementById("brushMode");
    this.brushSizeInput = document.getElementById("brushSize");
    this.brushSizeValue = document.getElementById("brushSizeValue");

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
    this.zoomInput.addEventListener("input", this.handleZoom.bind(this));
    this.editCanvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
    this.editCanvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.editCanvas.addEventListener("wheel", this.handleWheel.bind(this));
    this.brushModeBtn.addEventListener("click", this.toggleBrushMode.bind(this));
    this.brushSizeInput.addEventListener("input", this.handleBrushSizeChange.bind(this));
    
    // Adicionar suporte para arrastar e soltar
    const container = document.querySelector('.container');
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.classList.add('drag-over');
    });
    
    container.addEventListener('dragleave', () => {
      container.classList.remove('drag-over');
    });
    
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.classList.remove('drag-over');
      
      if (e.dataTransfer.files.length) {
        this.upload.files = e.dataTransfer.files;
        const event = new Event('change');
        this.upload.dispatchEvent(event);
      }
    });
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

    // Criar um wrapper para os canvas de edição
    const container = document.querySelector('.canvas-container');
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-wrapper';
    
    // Remover os canvas do container
    container.innerHTML = '';
    
    // Adicionar os canvas ao wrapper
    wrapper.appendChild(this.editCanvas);
    wrapper.appendChild(this.editPreviewCanvas);
    
    // Adicionar o wrapper ao container
    container.appendChild(wrapper);
  }

  saveState() {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.editCanvas.width;
    tempCanvas.height = this.editCanvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(this.editCanvas, 0, 0);
    
    // Remover estados futuros se estiver no meio do histórico
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.history.push(tempCanvas.toDataURL());
    this.historyIndex = this.history.length - 1;
    
    if (this.history.length > 20) {
      this.history.shift();
      this.historyIndex--;
    }
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

    // Usar um algoritmo de flood fill mais eficiente
    const stack = [[x, y]];
    const visited = new Set();
    const maxPixels = 500000; // Limitar para evitar stack overflow
    let pixelCount = 0;

    // Mostrar indicador de progresso
    this.message.textContent = "Processando...";
    
    // Usar requestAnimationFrame para não bloquear a interface
    const processChunk = () => {
      const startTime = performance.now();
      const maxTime = 50; // ms
      
      while (stack.length > 0 && pixelCount < maxPixels) {
        const [currentX, currentY] = stack.pop();
        const index = (currentY * width + currentX) * 4;

        if (
          currentX < 0 || currentX >= width ||
          currentY < 0 || currentY >= height ||
          visited.has(index)
        ) continue;

        visited.add(index);
        pixelCount++;

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
          
          // Adicionar pixels vizinhos à pilha
          if (pixelCount < maxPixels) {
            stack.push([currentX + 1, currentY]);
            stack.push([currentX - 1, currentY]);
            stack.push([currentX, currentY + 1]);
            stack.push([currentX, currentY - 1]);
            
            // Adicionar diagonais para melhor preenchimento
            stack.push([currentX + 1, currentY + 1]);
            stack.push([currentX - 1, currentY - 1]);
            stack.push([currentX + 1, currentY - 1]);
            stack.push([currentX - 1, currentY + 1]);
          }
        }
        
        // Verificar se já passou tempo suficiente
        if (performance.now() - startTime > maxTime) {
          // Atualizar progresso
          this.message.textContent = `Processando... ${Math.round((pixelCount / maxPixels) * 100)}%`;
          requestAnimationFrame(processChunk);
          return;
        }
      }
      
      // Finalizar
      this.editCtx.putImageData(imgData, 0, 0);
      this.message.textContent = "Área removida!";
    };
    
    requestAnimationFrame(processChunk);
  }

  handleMouseMove(event) {
    if (!this.image.src || this.image.src === location.href) return;

    const rect = this.editCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / this.zoomLevel);
    const y = Math.floor((event.clientY - rect.top) / this.zoomLevel);
    
    // Se estiver arrastando no modo pincel, remova pixels diretamente
    if (this.isDragging && this.brushMode) {
      this.applyBrush(x, y);
      return;
    }
    
    // Se estiver arrastando no modo mágico, use flood fill
    if (this.isDragging && !this.brushMode) {
      this.floodFill(x, y, parseInt(this.toleranceInput.value));
      return;
    }
    
    // Mostrar preview
    if (this.brushMode) {
      this.showBrushPreview(x, y);
    } else {
      this.showPreview(x, y);
    }
  }

  showPreview(x, y) {
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

    // Usar um algoritmo de flood fill mais eficiente para o preview
    const stack = [[x, y]];
    const visited = new Set();
    const maxPixels = 100000; // Limitar o número de pixels para melhor desempenho
    let pixelCount = 0;

    while (stack.length > 0 && pixelCount < maxPixels) {
      const [currentX, currentY] = stack.pop();
      const index = (currentY * width + currentX) * 4;

      if (
        currentX < 0 || currentX >= width ||
        currentY < 0 || currentY >= this.editCanvas.height ||
        visited.has(index)
      ) continue;

      visited.add(index);
      pixelCount++;

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
        
        // Adicionar pixels vizinhos à pilha
        if (pixelCount < maxPixels) {
          stack.push([currentX + 1, currentY]);
          stack.push([currentX - 1, currentY]);
          stack.push([currentX, currentY + 1]);
          stack.push([currentX, currentY - 1]);
        }
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
    const x = Math.floor((event.clientX - rect.left) / this.zoomLevel);
    const y = Math.floor((event.clientY - rect.top) / this.zoomLevel);
    const tolerance = parseInt(this.toleranceInput.value);

    if (x < 0 || x >= this.editCanvas.width || y < 0 || y >= this.editCanvas.height) return;

    this.saveState();
    this.floodFill(x, y, tolerance);
    this.message.textContent = "Área removida!";
    this.editPreviewCtx.clearRect(0, 0, this.editPreviewCanvas.width, this.editPreviewCanvas.height);
  }

  undoLastAction() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.loadState(this.historyIndex);
      this.message.textContent = "Ação anterior desfeita!";
    } else {
      this.message.textContent = "Nada para desfazer!";
    }
  }

  redoAction() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.loadState(this.historyIndex);
      this.message.textContent = "Ação refeita!";
    } else {
      this.message.textContent = "Nada para refazer!";
    }
  }

  loadState(index) {
    const state = new Image();
    state.onload = () => {
      this.editCtx.clearRect(0, 0, this.editCanvas.width, this.editCanvas.height);
      this.editCtx.drawImage(state, 0, 0);
    };
    state.src = this.history[index];
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
      this.message.textContent = "Nenhuma imagem para exportar!";
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
    this.message.textContent = "Imagem exportada como PNG!";
  }

  handleZoom() {
    this.zoomLevel = parseInt(this.zoomInput.value) / 100;
    this.zoomValue.textContent = this.zoomInput.value;
    this.applyZoom();
  }

  applyZoom() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper) {
      wrapper.style.transform = `scale(${this.zoomLevel})`;
    }
  }

  handleWheel(event) {
    event.preventDefault();
    if (event.deltaY < 0) {
      // Zoom in
      this.zoomLevel = Math.min(this.zoomLevel + 0.1, 4);
    } else {
      // Zoom out
      this.zoomLevel = Math.max(this.zoomLevel - 0.1, 1);
    }
    this.zoomInput.value = Math.round(this.zoomLevel * 100);
    this.zoomValue.textContent = this.zoomInput.value;
    this.applyZoom();
  }

  handleMouseDown(event) {
    if (!this.image.src || this.image.src === location.href) return;
    
    const rect = this.editCanvas.getBoundingClientRect();
    this.lastX = event.clientX - rect.left;
    this.lastY = event.clientY - rect.top;
    this.isDragging = true;
    
    // Aplicar remoção de fundo no clique
    this.handleCanvasClick(event);
  }

  handleMouseUp() {
    this.isDragging = false;
  }

  toggleBrushMode() {
    this.brushMode = !this.brushMode;
    if (this.brushMode) {
      this.message.textContent = "Modo pincel ativado. Arraste para remover áreas manualmente.";
      this.brushModeBtn.classList.add('active');
    } else {
      this.message.textContent = "Modo mágico ativado. Clique para remover áreas automaticamente.";
      this.brushModeBtn.classList.remove('active');
    }
  }

  applyBrush(x, y) {
    const imgData = this.editCtx.getImageData(0, 0, this.editCanvas.width, this.editCanvas.height);
    const pixels = imgData.data;
    const width = this.editCanvas.width;
    
    for (let i = -this.brushSize; i <= this.brushSize; i++) {
      for (let j = -this.brushSize; j <= this.brushSize; j++) {
        const currentX = x + i;
        const currentY = y + j;
        
        // Verificar se está dentro do círculo do pincel
        if (i*i + j*j <= this.brushSize*this.brushSize) {
          if (
            currentX >= 0 && currentX < width &&
            currentY >= 0 && currentY < this.editCanvas.height
          ) {
            const index = (currentY * width + currentX) * 4;
            pixels[index + 3] = 0; // Tornar transparente
          }
        }
      }
    }
    
    this.editCtx.putImageData(imgData, 0, 0);
  }

  showBrushPreview(x, y) {
    this.editPreviewCtx.clearRect(0, 0, this.editPreviewCanvas.width, this.editPreviewCanvas.height);
    this.editPreviewCtx.beginPath();
    this.editPreviewCtx.arc(x, y, this.brushSize, 0, Math.PI * 2);
    this.editPreviewCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    this.editPreviewCtx.fill();
  }

  handleBrushSizeChange() {
    this.brushSize = parseInt(this.brushSizeInput.value);
    this.brushSizeValue.textContent = this.brushSize;
  }

  // Initialize the app
  static init() {
    return new BackgroundRemover();
  }
}

// Start the application
document.addEventListener('DOMContentLoaded', BackgroundRemover.init);
