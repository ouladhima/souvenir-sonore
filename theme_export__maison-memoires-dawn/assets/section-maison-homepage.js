document.documentElement.classList.add("js-enabled");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const requestIdle =
  window.requestIdleCallback ||
  ((callback) =>
    window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 12 }),
      160,
    ));

class ScrollSequenceSection {
  constructor(root) {
    this.root = root;
    this.section = root.closest(".maison-homepage__sequence") || root;
    this.stage = root.querySelector("[data-sequence-stage]");
    this.canvas = root.querySelector("[data-sequence-canvas]");
    this.fallback = root.querySelector("[data-sequence-fallback]");
    this.context = this.canvas?.getContext("2d", { alpha: true });
    this.frameUrls = this.parseFrameUrls();

    this.frameCount = this.frameUrls.length || Number(root.dataset.frameCount || 0);
    this.framePad = Number(root.dataset.framePad || 4);
    this.mobileStep = Number(root.dataset.mobileStep || 2);
    this.holdRatio = Number(root.dataset.holdRatio || 0.84);

    this.cache = new Map();
    this.highPriorityQueue = [];
    this.lowPriorityQueue = [];
    this.activeLoads = 0;
    this.highPriorityMode = false;
    this.rafId = 0;
    this.currentFrame = null;
    this.failedCount = 0;
    this.frameStep = this.resolveFrameStep();
    this.sequenceFrames = this.buildSequenceFrames();

    this.handleScroll = this.scheduleRender.bind(this);
    this.handleResize = this.handleResizeEvent.bind(this);

    if (!this.context || !this.stage || !this.frameCount) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.section.classList.add("is-static");
      return;
    }

    this.init();
  }

  parseFrameUrls() {
    const source = this.root.querySelector("[data-sequence-urls]");
    if (!source) return [];

    try {
      const urls = JSON.parse(source.textContent || "[]");
      return Array.isArray(urls) ? urls : [];
    } catch (_error) {
      return [];
    }
  }

  resolveFrameStep() {
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const weakDevice =
      (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

    return isMobile || weakDevice ? this.mobileStep : 1;
  }

  buildSequenceFrames() {
    const frames = [];

    for (let frame = 1; frame <= this.frameCount; frame += this.frameStep) {
      frames.push(frame);
    }

    if (frames[frames.length - 1] !== this.frameCount) {
      frames.push(this.frameCount);
    }

    return frames;
  }

  getFrameSource(frameNumber) {
    if (this.frameUrls.length) {
      return this.frameUrls[frameNumber - 1];
    }

    const padded = String(frameNumber).padStart(this.framePad, "0");
    return `frame_${padded}.webp`;
  }

  getPriorityFrames() {
    const priorityFrames = new Set([
      this.sequenceFrames[0],
      this.sequenceFrames[this.sequenceFrames.length - 1],
    ]);
    const interval = Math.max(Math.floor(this.sequenceFrames.length / 6), 1);

    for (let index = 0; index < this.sequenceFrames.length; index += interval) {
      priorityFrames.add(this.sequenceFrames[index]);
    }

    return [...priorityFrames];
  }

  enqueueFrames(frames, highPriority = false) {
    const queue = highPriority ? this.highPriorityQueue : this.lowPriorityQueue;

    frames.forEach((frameNumber) => {
      if (this.cache.has(frameNumber)) return;
      if (this.highPriorityQueue.includes(frameNumber) || this.lowPriorityQueue.includes(frameNumber)) return;
      queue.push(frameNumber);
    });

    this.pumpQueue();
  }

  pumpQueue() {
    const maxConcurrent = this.highPriorityMode ? 4 : 2;

    while (this.activeLoads < maxConcurrent && (this.highPriorityQueue.length || this.lowPriorityQueue.length)) {
      const frameNumber = this.highPriorityQueue.shift() ?? this.lowPriorityQueue.shift();
      this.activeLoads += 1;
      this.loadFrame(frameNumber)
        .catch(() => {
          this.failedCount += 1;
          if (this.failedCount > 12 && !this.section.classList.contains("is-ready")) {
            this.section.classList.add("is-static");
          }
        })
        .finally(() => {
          this.activeLoads -= 1;
          this.pumpQueue();
          this.scheduleRender();
        });
    }
  }

  loadFrame(frameNumber) {
    const existing = this.cache.get(frameNumber);
    if (existing?.promise) return existing.promise;
    if (existing?.img) return Promise.resolve(existing.img);

    const image = new Image();
    if (this.highPriorityMode && "fetchPriority" in image) {
      image.fetchPriority = "high";
    }

    const promise = new Promise((resolve, reject) => {
      image.onload = () => {
        this.cache.set(frameNumber, { img: image, promise: Promise.resolve(image) });

        if (!this.stage.style.aspectRatio && image.naturalWidth && image.naturalHeight) {
          this.stage.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
        }

        resolve(image);
      };

      image.onerror = reject;
      image.src = this.getFrameSource(frameNumber);
    });

    this.cache.set(frameNumber, { promise });
    return promise;
  }

  findClosestLoadedFrame(targetIndex) {
    for (let offset = 0; offset < this.sequenceFrames.length; offset += 1) {
      const beforeIndex = targetIndex - offset;
      if (beforeIndex >= 0) {
        const beforeFrame = this.sequenceFrames[beforeIndex];
        const beforeEntry = this.cache.get(beforeFrame);
        if (beforeEntry?.img) {
          return { frameNumber: beforeFrame, image: beforeEntry.img };
        }
      }

      const afterIndex = targetIndex + offset;
      if (afterIndex < this.sequenceFrames.length) {
        const afterFrame = this.sequenceFrames[afterIndex];
        const afterEntry = this.cache.get(afterFrame);
        if (afterEntry?.img) {
          return { frameNumber: afterFrame, image: afterEntry.img };
        }
      }
    }

    return null;
  }

  drawFrame(image) {
    const bounds = this.stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !image) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.max(1, Math.round(bounds.width * dpr));
    const targetHeight = Math.max(1, Math.round(bounds.height * dpr));

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
      this.canvas.style.width = `${bounds.width}px`;
      this.canvas.style.height = `${bounds.height}px`;
    }

    this.context.clearRect(0, 0, targetWidth, targetHeight);

    const scale = Math.min(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const drawX = (targetWidth - drawWidth) / 2;
    const drawY = (targetHeight - drawHeight) / 2;

    this.context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    this.section.classList.add("is-ready");

    if (this.fallback) {
      this.fallback.setAttribute("aria-hidden", "true");
    }
  }

  render() {
    this.rafId = 0;

    const rect = this.root.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const totalScroll = Math.max(this.root.offsetHeight - viewportHeight, 1);
    const travelled = clamp(-rect.top, 0, totalScroll);
    const progress = travelled / totalScroll;
    const animationProgress = clamp(progress / this.holdRatio, 0, 1);
    const targetIndex = Math.round(animationProgress * (this.sequenceFrames.length - 1));

    this.section.classList.toggle(
      "is-active",
      rect.top < viewportHeight * 0.78 && rect.bottom > viewportHeight * 0.25,
    );
    this.section.classList.toggle("is-complete", progress >= this.holdRatio);

    const closestLoaded = this.findClosestLoadedFrame(targetIndex);
    if (!closestLoaded) return;
    if (closestLoaded.frameNumber === this.currentFrame) return;

    this.currentFrame = closestLoaded.frameNumber;
    this.drawFrame(closestLoaded.image);
  }

  scheduleRender() {
    if (this.rafId) return;
    this.rafId = window.requestAnimationFrame(() => this.render());
  }

  handleResizeEvent() {
    const nextStep = this.resolveFrameStep();

    if (nextStep !== this.frameStep) {
      this.frameStep = nextStep;
      this.sequenceFrames = this.buildSequenceFrames();
      this.enqueueFrames(this.getPriorityFrames(), false);

      if (this.highPriorityMode) {
        this.enqueueFrames(this.sequenceFrames, true);
      }
    }

    this.currentFrame = null;
    this.scheduleRender();
  }

  init() {
    this.enqueueFrames([this.sequenceFrames[0]], false);

    requestIdle(() => {
      this.enqueueFrames(this.getPriorityFrames(), false);
    });

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          this.highPriorityMode = true;
          this.enqueueFrames(this.sequenceFrames, true);
        });
      },
      {
        rootMargin: "150% 0px",
        threshold: 0,
      },
    );

    this.observer.observe(this.root);

    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });
    this.scheduleRender();
  }
}

class HeroIntro {
  static LOAD_TIMEOUT = 3500;

  constructor(root) {
    this.root = root;
    this.stage = root.querySelector("[data-hero-intro-stage]");
    this.canvas = root.querySelector("[data-hero-intro-canvas]");
    this.finalImage = root.querySelector("[data-hero-intro-final]");
    this.duration = Number(root.dataset.introDuration || 5000);
    this.frames = [];
    this.pending = [];
    this.done = false;

    if (!root.classList.contains("is-intro")) return;
    root.classList.add("is-armed");

    this.context = this.canvas?.getContext("2d", { alpha: false });
    const urls = this.parseFrameUrls();

    if (!this.stage || !this.context || !urls.length) {
      this.settle();
      return;
    }

    this.load(urls);
  }

  parseFrameUrls() {
    const source = this.root.querySelector("[data-hero-intro-frames]");
    if (!source) return [];

    try {
      const sets = JSON.parse(source.textContent || "{}");
      const urls = window.matchMedia("(max-width: 749px)").matches ? sets.mobile : sets.desktop;
      return Array.isArray(urls) ? urls : [];
    } catch (_error) {
      return [];
    }
  }

  load(urls) {
    const timeout = window.setTimeout(() => this.abort(), HeroIntro.LOAD_TIMEOUT);

    Promise.all(urls.map((url) => this.loadImage(url)))
      .then((frames) => {
        window.clearTimeout(timeout);
        if (this.done) return;
        this.frames = frames;
        this.whenVisible(() => this.play());
      })
      .catch(() => {
        window.clearTimeout(timeout);
        this.abort();
      });
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
      this.pending.push(image);
    });
  }

  abort() {
    if (this.done) return;
    this.pending.forEach((image) => {
      if (!image.complete) image.removeAttribute("src");
    });
    this.settle();
  }

  whenVisible(callback) {
    if (!document.hidden) {
      callback();
      return;
    }

    const handleVisibility = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", handleVisibility);
      callback();
    };

    document.addEventListener("visibilitychange", handleVisibility);
  }

  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(this.stage.offsetWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.stage.offsetHeight * dpr));
    this.lastPosition = -1;
  }

  drawAt(progress) {
    const position = progress * (this.frames.length - 1);
    if (position === this.lastPosition) return;
    this.lastPosition = position;

    const index = Math.floor(position);
    // Short cross-fade in the middle of each frame interval: smooths the lighter mobile set (12 fps)
    // without the ghosting a full-length dissolve gives fast-moving parts.
    const blend = clamp((position - index - 0.3) / 0.4, 0, 1);
    const { width, height } = this.canvas;

    this.context.globalAlpha = 1;
    this.context.drawImage(this.frames[index], 0, 0, width, height);

    if (blend > 0 && this.frames[index + 1]) {
      this.context.globalAlpha = blend;
      this.context.drawImage(this.frames[index + 1], 0, 0, width, height);
    }
  }

  play() {
    try {
      this.resizeCanvas();
      this.drawAt(0);
    } catch (_error) {
      this.settle();
      return;
    }

    this.root.classList.add("is-playing");
    this.handleResize = () => this.resizeCanvas();
    window.addEventListener("resize", this.handleResize, { passive: true });

    let start = 0;
    const tick = (now) => {
      if (!start) start = now;
      const progress = Math.min((now - start) / this.duration, 1);
      this.drawAt(progress);

      if (progress < 1) {
        window.requestAnimationFrame(tick);
        return;
      }

      this.finish();
    };

    window.requestAnimationFrame(tick);
  }

  finish() {
    window.removeEventListener("resize", this.handleResize);

    // Swap to the crisp still only once it is decoded, so the hand-off is invisible.
    const ready = this.finalImage?.decode ? this.finalImage.decode().catch(() => {}) : Promise.resolve();
    ready.then(() => this.settle());
  }

  settle() {
    if (this.done) return;
    this.done = true;
    this.frames = [];
    this.pending = [];
    this.root.classList.remove("is-intro", "is-playing");
  }
}

document.querySelectorAll("[data-hero-intro]").forEach((root) => {
  new HeroIntro(root);
});

document.querySelectorAll("[data-scroll-sequence]").forEach((root) => {
  new ScrollSequenceSection(root);
});
