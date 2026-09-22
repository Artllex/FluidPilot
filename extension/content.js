/* FluidPilot Firefox extension content script. */

browser.storage.local.get().then(initialStorage => {
    const storageCache = { ...initialStorage };

    function GM_addStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).append(style);
        return style;
    }

    function GM_getValue(key, fallback) {
        return Object.prototype.hasOwnProperty.call(storageCache, key)
            ? storageCache[key]
            : fallback;
    }

    function GM_setValue(key, value) {
        storageCache[key] = value;
        return browser.storage.local.set({ [key]: value });
    }

    function GM_addValueChangeListener(key, callback) {
        browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local' || !changes[key]) return;
            const change = changes[key];
            storageCache[key] = change.newValue;
            callback(key, change.oldValue, change.newValue, true);
        });
    }

    function GM_xmlhttpRequest(details) {
        const controller = new AbortController();
        const timeout = details.timeout
            ? setTimeout(() => {
                controller.abort();
                details.ontimeout?.();
            }, details.timeout)
            : null;

        fetch(details.url, {
            method: details.method || 'GET',
            signal: controller.signal,
            credentials: 'include'
        }).then(async response => {
            const total = Number(response.headers.get('content-length')) || 0;
            if (!response.body) {
                const blob = await response.blob();
                details.onload?.({ status: response.status, response: blob });
                return;
            }
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.byteLength;
                details.onprogress?.({ loaded, total, lengthComputable: total > 0 });
            }
            const type = response.headers.get('content-type') || 'application/octet-stream';
            details.onload?.({
                status: response.status,
                response: new Blob(chunks, { type })
            });
        }).catch(error => {
            if (error.name !== 'AbortError') details.onerror?.(error);
        }).finally(() => {
            if (timeout) clearTimeout(timeout);
        });
    }

(function () {
    'use strict';

    const VIDEO = '#thisPlayer';
    const TIMELINE = '#thisPlayer_fluid_controls_progress_container';
    const OLD_PREVIEW = '#thisPlayer_fluid_timeline_preview_container';
    const OLD_SHADOW = '#thisPlayer_fluid_timeline_preview_container_shadow';
    const PREVIEW_HIDE_MS = 2000;
    const PREVIEW_SETTLE_MS = 120;
    const PREVIEW_HOT_ZONE_PX = 30;
    const PREVIEW_MAX_WIDTH_PX = 240;
    const LOOP_EDGE_STEP = 1;
    const LOOP_MIN_LENGTH = 1;
    const LOOP_DEFAULT_RADIUS = 1;
    const TIMELINE_SEEK_WINDOW_MS = 1000;
    const EPSILON = 0.000001;
    const GIF_MAX_WIDTH_PX = 1280;
    const GIF_TARGET_FPS = 12;
    const GIF_MAX_FRAMES = 180;
    const QUIET_MODE_KEY = 'fluidpilot-volume-5-enabled';
    const QUIET_PREVIOUS_VOLUME_KEY = 'fluidpilot-volume-before-5';
    const HIDE_CURSOR_KEY = 'fluidpilot-hide-cursor';
    const getVideo = () => document.querySelector(VIDEO);
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
    let loopEnabled = false;
    let loopStart = 0;
    let loopEnd = 0;
    let loopDisplayStart = 0;
    let loopDisplayEnd = 1;
    let zPressed = false;
    let xPressed = false;
    let loopVideo = null;
    let manualTimelineSeekUntil = 0;
    let loopAnimationFrame = null;
    let quietModeEnabled = Boolean(GM_getValue(QUIET_MODE_KEY, false));
    let hideCursorEnabled = Boolean(GM_getValue(HIDE_CURSOR_KEY, false));
    let quietModeApplying = false;
    let pointerKnown = false;
    let pointerX = 0;
    let pointerY = 0;
    let gifExportBusy = false;
    let videoExportBusy = false;
    let gifStatusTimer = null;

    const cursorStyle = GM_addStyle('');
    function applyCursorPreference() {
        const cursor = hideCursorEnabled ? 'none' : 'default';
        cursorStyle.textContent = `
            ${VIDEO}, ${VIDEO}:hover,
            #fluid_video_wrapper_thisPlayer,
            #fluid_video_wrapper_thisPlayer * { cursor: ${cursor} !important; }
        `;
    }
    applyCursorPreference();

    GM_addStyle(`
        ${OLD_PREVIEW}, ${OLD_SHADOW} { display: none !important; }
        #fluidpilot-live-preview-box {
            position: fixed; display: none; width: 240px; height: 135px;
            overflow: hidden; background: #000; border-radius: 4px;
            z-index: 2147483647; pointer-events: none;
            box-shadow: 0 4px 14px rgba(0,0,0,.65);
        }
        #fluidpilot-live-preview-video {
            display: block; width: 100%; height: 100%;
            object-fit: contain; background: #000; pointer-events: none;
        }
        #fluidpilot-live-preview-time {
            position: absolute; left: 50%; bottom: 5px;
            transform: translateX(-50%); padding: 2px 6px;
            border-radius: 3px; background: rgba(0,0,0,.75); color: #fff;
            font: 12px/16px Arial,sans-serif; white-space: nowrap;
        }
        #fluidpilot-loop-indicator {
            position: fixed; left: 0; top: 0;
            display: none; align-items: center; gap: 6px;
            padding: 4px 7px; border-radius: 4px;
            background: rgba(0,0,0,.78); color: #aaa;
            font: 600 12px/15px Consolas,"Courier New",monospace;
            letter-spacing: .2px; white-space: nowrap; pointer-events: none;
            z-index: 2147483647; box-shadow: 0 3px 12px rgba(0,0,0,.5);
        }
        #fluidpilot-loop-cycle {
            width: 11px; height: 11px; flex: 0 0 11px;
            border-radius: 50%;
            background: conic-gradient(from -90deg, #aaa 0deg, rgba(170,170,170,.2) 0deg);
            box-shadow: inset 0 0 0 1px rgba(170,170,170,.28);
        }
        #fluidpilot-gif-status {
            display: none; margin-left: 2px;
            color: #aaa; font: 600 11px/15px Consolas,"Courier New",monospace;
            white-space: nowrap;
        }
    `);

    function isTyping(event) {
        const t = event.target;
        return t instanceof Element &&
            (t.isContentEditable || !!t.closest('input,textarea,select,[role="textbox"]'));
    }
    function consume(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }
    function play(video) {
        const result = video.play();
        if (result) result.catch(() => {});
    }
    function togglePlayback(video) {
        if (video.paused || video.ended) play(video);
        else video.pause();
    }

    document.querySelector('#fluidpilot-loop-indicator')?.remove();
    const loopIndicator = document.createElement('div');
    loopIndicator.id = 'fluidpilot-loop-indicator';
    const loopIndicatorText = document.createElement('span');
    const loopCycle = document.createElement('span');
    loopCycle.id = 'fluidpilot-loop-cycle';
    const gifStatus = document.createElement('span');
    gifStatus.id = 'fluidpilot-gif-status';
    loopIndicator.append(loopIndicatorText, loopCycle, gifStatus);
    document.body.append(loopIndicator);

    function cleanLoopNumber(value) {
        if (Math.abs(value) < EPSILON) value = 0;
        const rounded = Math.round(value);
        return String(Math.abs(value - rounded) < EPSILON
            ? rounded
            : Math.round(value * 10) / 10);
    }
    function hideLoopIndicator() {
        if (loopAnimationFrame !== null) cancelAnimationFrame(loopAnimationFrame);
        loopAnimationFrame = null;
        loopIndicator.style.display = 'none';
    }
    function updateLoopCycle() {
        loopAnimationFrame = null;
        const video = getVideo();
        const length = loopEnd - loopStart;
        if (!loopEnabled || video !== loopVideo || !video || length <= 0) return;
        enforceLoop();
        const phase = clamp((video.currentTime - loopStart) / length, 0, 1);
        const angle = Math.round(phase * 3600) / 10;
        loopCycle.style.background =
            `conic-gradient(from -90deg, #aaa ${angle}deg, rgba(170,170,170,.2) ${angle}deg)`;
        if (!video.paused) loopAnimationFrame = requestAnimationFrame(updateLoopCycle);
    }
    function startLoopCycleAnimation() {
        if (loopAnimationFrame === null) {
            loopAnimationFrame = requestAnimationFrame(updateLoopCycle);
        }
    }
    function positionLoopIndicator() {
        const mainVideo = getVideo();
        if (!mainVideo || loopIndicator.style.display === 'none') return;
        const rect = mainVideo.getBoundingClientRect();
        const timeline = document.querySelector(TIMELINE);
        const timelineRect = timeline?.getBoundingClientRect();
        const bottom = timelineRect && timelineRect.top > rect.top
            ? timelineRect.top - 8
            : rect.bottom - 10;
        loopIndicator.style.left = (rect.left + 10) + 'px';
        loopIndicator.style.top =
            Math.max(rect.top + 8, bottom - loopIndicator.offsetHeight) + 'px';
    }
    function showLoopIndicator() {
        const mainVideo = getVideo();
        const fullscreen = document.fullscreenElement;
        const host = fullscreen && fullscreen !== mainVideo ? fullscreen : document.body;
        if (loopIndicator.parentNode !== host) host.append(loopIndicator);
        loopIndicatorText.textContent =
            `[${cleanLoopNumber(loopDisplayStart)} ${cleanLoopNumber(loopDisplayEnd)}]`;
        loopIndicator.style.display = 'flex';
        positionLoopIndicator();
        startLoopCycleAnimation();
    }
    function rebaseLoopAtPlayhead(video) {
        let newStart = video.currentTime + loopDisplayStart;
        let newEnd = video.currentTime + loopDisplayEnd;
        // Przy krawędzi filmu przesuwamy całe okno, zachowując jego długość.
        if (newStart < 0) {
            newEnd -= newStart;
            newStart = 0;
        }
        if (newEnd > video.duration) {
            newStart -= newEnd - video.duration;
            newEnd = video.duration;
        }
        loopStart = Math.max(0, newStart);
        loopEnd = Math.min(video.duration, newEnd);
        showLoopIndicator();
    }

    function keepPlayheadInsideLoop(video) {
        if (video.currentTime < loopStart || video.currentTime >= loopEnd) {
            video.currentTime = loopStart;
        }
    }

    function setGifStatus(text, hideAfterMs = 0) {
        clearTimeout(gifStatusTimer);
        gifStatusTimer = null;
        gifStatus.textContent = text;
        gifStatus.style.display = text ? 'inline' : 'none';
        if (loopEnabled) showLoopIndicator();
        if (text && hideAfterMs > 0) {
            gifStatusTimer = setTimeout(() => {
                gifStatus.textContent = '';
                gifStatus.style.display = 'none';
                gifStatusTimer = null;
            }, hideAfterMs);
        }
    }

    function createGifPalette() {
        const palette = new Uint8Array(256 * 3);
        let index = 0;
        for (let red = 0; red < 6; red++) {
            for (let green = 0; green < 7; green++) {
                for (let blue = 0; blue < 6; blue++, index++) {
                    palette[index * 3] = Math.round(red * 255 / 5);
                    palette[index * 3 + 1] = Math.round(green * 255 / 6);
                    palette[index * 3 + 2] = Math.round(blue * 255 / 5);
                }
            }
        }
        for (; index < 256; index++) {
            const gray = (index - 252) * 85;
            palette[index * 3] = gray;
            palette[index * 3 + 1] = gray;
            palette[index * 3 + 2] = gray;
        }
        return palette;
    }

    function rgbaToGifPalette(rgba, width, height) {
        const indexed = new Uint8Array(width * height);
        let currentR = new Float32Array(width + 2);
        let currentG = new Float32Array(width + 2);
        let currentB = new Float32Array(width + 2);
        let nextR = new Float32Array(width + 2);
        let nextG = new Float32Array(width + 2);
        let nextB = new Float32Array(width + 2);
        const clamp = value => Math.max(0, Math.min(255, value));

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const target = y * width + x;
                const source = target * 4;
                const red = clamp(rgba[source] + currentR[x + 1]);
                const green = clamp(rgba[source + 1] + currentG[x + 1]);
                const blue = clamp(rgba[source + 2] + currentB[x + 1]);
                const redLevel = Math.round(red * 5 / 255);
                const greenLevel = Math.round(green * 6 / 255);
                const blueLevel = Math.round(blue * 5 / 255);
                const redError = red - redLevel * 255 / 5;
                const greenError = green - greenLevel * 255 / 6;
                const blueError = blue - blueLevel * 255 / 5;

                indexed[target] = redLevel * 42 + greenLevel * 6 + blueLevel;

                currentR[x + 2] += redError * 7 / 16;
                currentG[x + 2] += greenError * 7 / 16;
                currentB[x + 2] += blueError * 7 / 16;
                nextR[x] += redError * 3 / 16;
                nextG[x] += greenError * 3 / 16;
                nextB[x] += blueError * 3 / 16;
                nextR[x + 1] += redError * 5 / 16;
                nextG[x + 1] += greenError * 5 / 16;
                nextB[x + 1] += blueError * 5 / 16;
                nextR[x + 2] += redError / 16;
                nextG[x + 2] += greenError / 16;
                nextB[x + 2] += blueError / 16;
            }

            [currentR, nextR] = [nextR, currentR];
            [currentG, nextG] = [nextG, currentG];
            [currentB, nextB] = [nextB, currentB];
            nextR.fill(0);
            nextG.fill(0);
            nextB.fill(0);
        }
        return indexed;
    }

    function lzwCompressGif(indexedPixels) {
        const minimumCodeSize = 8;
        const clearCode = 1 << minimumCodeSize;
        const endCode = clearCode + 1;
        const output = [];
        const dictionary = new Map();
        let nextCode = endCode + 1;
        let codeSize = minimumCodeSize + 1;
        let bitBuffer = 0;
        let bitCount = 0;

        function writeCode(code) {
            bitBuffer |= code << bitCount;
            bitCount += codeSize;
            while (bitCount >= 8) {
                output.push(bitBuffer & 0xff);
                bitBuffer >>>= 8;
                bitCount -= 8;
            }
            // Dekoder buduje słownik o jeden kod później niż encoder.
            // Zwiększamy szerokość dopiero po zapisaniu bieżącego kodu.
            if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
        }
        function resetDictionary() {
            dictionary.clear();
            nextCode = endCode + 1;
            codeSize = minimumCodeSize + 1;
        }

        writeCode(clearCode);
        if (indexedPixels.length > 0) {
            let prefix = indexedPixels[0];
            for (let i = 1; i < indexedPixels.length; i++) {
                const suffix = indexedPixels[i];
                const key = prefix * 256 + suffix;
                const existing = dictionary.get(key);
                if (existing !== undefined) {
                    prefix = existing;
                    continue;
                }

                writeCode(prefix);
                if (nextCode < 4096) {
                    dictionary.set(key, nextCode++);
                } else {
                    writeCode(clearCode);
                    resetDictionary();
                }
                prefix = suffix;
            }
            writeCode(prefix);
        }
        writeCode(endCode);
        if (bitCount > 0) output.push(bitBuffer & 0xff);
        return new Uint8Array(output);
    }

    function createGifEncoder(width, height, frameDelayMs) {
        const chunks = [];
        let buffer = [];

        function flush() {
            if (!buffer.length) return;
            chunks.push(Uint8Array.from(buffer));
            buffer = [];
        }
        function byte(value) {
            buffer.push(value & 0xff);
            if (buffer.length >= 8192) flush();
        }
        function bytes(values) {
            for (const value of values) byte(value);
        }
        function uint16(value) {
            byte(value);
            byte(value >> 8);
        }
        function text(value) {
            for (let i = 0; i < value.length; i++) byte(value.charCodeAt(i));
        }

        text('GIF89a');
        uint16(width);
        uint16(height);
        bytes([0xf7, 0, 0]);
        bytes(createGifPalette());
        bytes([0x21, 0xff, 0x0b]);
        text('NETSCAPE2.0');
        bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

        return {
            writeFrame(indexedPixels) {
                const delay = Math.max(2, Math.round(frameDelayMs / 10));
                bytes([0x21, 0xf9, 0x04, 0x00]);
                uint16(delay);
                bytes([0x00, 0x00]);
                byte(0x2c);
                uint16(0);
                uint16(0);
                uint16(width);
                uint16(height);
                byte(0x00);
                byte(0x08);

                const compressed = lzwCompressGif(indexedPixels);
                for (let offset = 0; offset < compressed.length; offset += 255) {
                    const length = Math.min(255, compressed.length - offset);
                    byte(length);
                    bytes(compressed.subarray(offset, offset + length));
                }
                byte(0x00);
            },
            finish() {
                byte(0x3b);
                flush();
                return new Blob(chunks, { type: 'image/gif' });
            }
        };
    }

    function waitForVideoMetadata(video) {
        if (video.readyState >= 1 && video.videoWidth > 0) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => done(new Error('Przekroczono czas ładowania filmu.')), 20000);
            function done(error) {
                clearTimeout(timeout);
                video.removeEventListener('loadedmetadata', onLoaded);
                video.removeEventListener('error', onError);
                error ? reject(error) : resolve();
            }
            function onLoaded() { done(); }
            function onError() { done(new Error('Nie można załadować źródła filmu.')); }
            video.addEventListener('loadedmetadata', onLoaded, { once: true });
            video.addEventListener('error', onError, { once: true });
        });
    }

    function seekVideo(video, time) {
        const target = clamp(time, 0, Math.max(0, video.duration - EPSILON));
        if (Math.abs(video.currentTime - target) < EPSILON && !video.seeking) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            function cleanup() {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
            }
            function onSeeked() { cleanup(); resolve(); }
            function onError() { cleanup(); reject(new Error('Błąd odczytu klatki filmu.')); }
            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onError, { once: true });
            try {
                video.currentTime = target;
            } catch (error) {
                cleanup();
                reject(error);
            }
        });
    }

    function createExportVideo(source, crossOrigin) {
        const video = document.createElement('video');
        video.muted = true;
        video.defaultMuted = true;
        video.preload = 'auto';
        video.playsInline = true;
        if (crossOrigin) video.crossOrigin = 'anonymous';
        video.src = source;
        video.load();
        return video;
    }

    function downloadSourceBlob(url, statusLabel = 'GIF') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onprogress(event) {
                    if (!event.lengthComputable || !event.total) {
                        setGifStatus(`${statusLabel}: pobieranie…`);
                        return;
                    }
                    const percent = Math.round(event.loaded / event.total * 100);
                    setGifStatus(`${statusLabel}: pobieranie ${percent}%`);
                },
                onload(response) {
                    if (response.status >= 200 && response.status < 300 && response.response) {
                        resolve(response.response);
                    } else {
                        reject(new Error(`Pobieranie filmu nie powiodło się (${response.status}).`));
                    }
                },
                onerror() { reject(new Error('Nie można pobrać filmu.')); },
                ontimeout() { reject(new Error('Pobieranie filmu przekroczyło limit czasu.')); }
            });
        });
    }

    async function encodeLoopFromSource(source, crossOrigin, start, end) {
        const exportVideo = createExportVideo(source, crossOrigin);
        try {
            await waitForVideoMetadata(exportVideo);
            const safeStart = clamp(start, 0, exportVideo.duration);
            const safeEnd = clamp(end, safeStart + EPSILON, exportVideo.duration);
            const duration = safeEnd - safeStart;
            const frameCount = Math.max(2, Math.min(
                GIF_MAX_FRAMES,
                Math.ceil(duration * GIF_TARGET_FPS)
            ));
            const width = Math.max(1, Math.min(GIF_MAX_WIDTH_PX, exportVideo.videoWidth));
            const height = Math.max(1, Math.round(exportVideo.videoHeight * width / exportVideo.videoWidth));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
            if (!context) throw new Error('Przeglądarka nie udostępniła Canvas 2D.');

            const encoder = createGifEncoder(width, height, duration * 1000 / frameCount);
            for (let frame = 0; frame < frameCount; frame++) {
                const time = safeStart + duration * frame / frameCount;
                await seekVideo(exportVideo, time);
                context.drawImage(exportVideo, 0, 0, width, height);
                const rgba = context.getImageData(0, 0, width, height).data;
                encoder.writeFrame(rgbaToGifPalette(rgba, width, height));
                setGifStatus(`GIF: ${Math.round((frame + 1) / frameCount * 100)}%`);
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
            return encoder.finish();
        } finally {
            exportVideo.removeAttribute('src');
            exportVideo.load();
        }
    }

    function downloadGif(blob, start, end) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const from = Math.round(start * 10) / 10;
        const to = Math.round(end * 10) / 10;
        link.href = url;
        link.download = `fluidpilot-loop-${from}s-${to}s.gif`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    async function exportLoopGif() {
        if (gifExportBusy || !loopEnabled) return;
        const mainVideo = getVideo();
        const source = mainVideo?.currentSrc;
        if (!mainVideo || !source || loopEnd <= loopStart) return;

        gifExportBusy = true;
        const start = loopStart;
        const end = loopEnd;
        let localSourceUrl = null;
        setGifStatus('GIF: przygotowanie…');
        try {
            let gif;
            try {
                gif = await encodeLoopFromSource(source, true, start, end);
            } catch (directError) {
                if (!/^https?:/i.test(source)) throw directError;
                setGifStatus('GIF: pobieranie…');
                const sourceBlob = await downloadSourceBlob(source);
                localSourceUrl = URL.createObjectURL(sourceBlob);
                gif = await encodeLoopFromSource(localSourceUrl, false, start, end);
            }
            downloadGif(gif, start, end);
            setGifStatus('GIF: gotowy', 2500);
        } catch (error) {
            console.error('[FluidPilot] Eksport GIF:', error);
            setGifStatus('GIF: błąd', 4000);
        } finally {
            if (localSourceUrl) URL.revokeObjectURL(localSourceUrl);
            gifExportBusy = false;
        }
    }

    function chooseRecordingFormat() {
        const candidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    async function recordLoopFromSource(source, crossOrigin, start, end) {
        if (typeof MediaRecorder !== 'function') {
            throw new Error('Przeglądarka nie obsługuje nagrywania wideo.');
        }
        const exportVideo = createExportVideo(source, crossOrigin);
        let stream = null;
        try {
            await waitForVideoMetadata(exportVideo);
            const safeStart = clamp(start, 0, exportVideo.duration);
            const safeEnd = clamp(end, safeStart + EPSILON, exportVideo.duration);
            const duration = safeEnd - safeStart;
            await seekVideo(exportVideo, safeStart);

            const capture = exportVideo.captureStream || exportVideo.mozCaptureStream;
            if (typeof capture !== 'function') {
                throw new Error('Przeglądarka nie udostępnia strumienia filmu.');
            }
            stream = capture.call(exportVideo);
            const mimeType = chooseRecordingFormat();
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 })
                : new MediaRecorder(stream);
            const chunks = [];
            recorder.addEventListener('dataavailable', event => {
                if (event.data?.size) chunks.push(event.data);
            });
            const stopped = new Promise((resolve, reject) => {
                recorder.addEventListener('stop', resolve, { once: true });
                recorder.addEventListener('error', event => {
                    reject(event.error || new Error('Błąd nagrywania wideo.'));
                }, { once: true });
            });

            recorder.start(250);
            await exportVideo.play();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => finish(new Error('Nagrywanie przekroczyło limit czasu.')),
                    Math.max(30000, duration * 3000));
                const update = () => {
                    const progress = clamp((exportVideo.currentTime - safeStart) / duration, 0, 1);
                    setGifStatus(`WIDEO: ${Math.round(progress * 100)}%`);
                    if (exportVideo.currentTime >= safeEnd - 0.015 || exportVideo.ended) finish();
                };
                const failed = () => finish(new Error('Błąd podczas odtwarzania eksportowanego fragmentu.'));
                function finish(error) {
                    clearTimeout(timeout);
                    exportVideo.removeEventListener('timeupdate', update);
                    exportVideo.removeEventListener('ended', update);
                    exportVideo.removeEventListener('error', failed);
                    error ? reject(error) : resolve();
                }
                exportVideo.addEventListener('timeupdate', update);
                exportVideo.addEventListener('ended', update);
                exportVideo.addEventListener('error', failed, { once: true });
                update();
            });
            exportVideo.pause();
            recorder.stop();
            await stopped;
            if (!chunks.length) throw new Error('Nagranie jest puste.');
            return new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
        } finally {
            exportVideo.pause();
            if (stream) stream.getTracks().forEach(track => track.stop());
            exportVideo.removeAttribute('src');
            exportVideo.load();
        }
    }

    function downloadLoopVideo(blob, start, end) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const from = Math.round(start * 10) / 10;
        const to = Math.round(end * 10) / 10;
        link.href = url;
        link.download = `fluidpilot-loop-${from}s-${to}s.webm`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    async function exportLoopVideo() {
        if (videoExportBusy || gifExportBusy || !loopEnabled) return;
        const mainVideo = getVideo();
        const source = mainVideo?.currentSrc;
        if (!mainVideo || !source || loopEnd <= loopStart) return;

        videoExportBusy = true;
        const start = loopStart;
        const end = loopEnd;
        let localSourceUrl = null;
        setGifStatus('WIDEO: przygotowanie…');
        try {
            let recording;
            try {
                recording = await recordLoopFromSource(source, true, start, end);
            } catch (directError) {
                if (!/^https?:/i.test(source)) throw directError;
                setGifStatus('WIDEO: pobieranie…');
                const sourceBlob = await downloadSourceBlob(source, 'WIDEO');
                localSourceUrl = URL.createObjectURL(sourceBlob);
                recording = await recordLoopFromSource(localSourceUrl, false, start, end);
            }
            downloadLoopVideo(recording, start, end);
            setGifStatus('WIDEO: gotowe', 2500);
        } catch (error) {
            console.error('[FluidPilot] Eksport wideo:', error);
            setGifStatus('WIDEO: błąd', 4000);
        } finally {
            if (localSourceUrl) URL.revokeObjectURL(localSourceUrl);
            videoExportBusy = false;
        }
    }

    function pointerIsOverVideo(video) {
        if (video.matches(':hover')) return true;
        if (!pointerKnown) return false;
        const rect = video.getBoundingClientRect();
        return pointerX >= rect.left && pointerX <= rect.right &&
            pointerY >= rect.top && pointerY <= rect.bottom;
    }
    function setVideoVolume(video, volume) {
        const target = clamp(Number(volume), 0, 1);
        if (!Number.isFinite(target) || Math.abs(video.volume - target) < 0.0001) return;
        quietModeApplying = true;
        try {
            video.volume = target;
        } finally {
            quietModeApplying = false;
        }
    }
    function applyQuietMode() {
        if (!quietModeEnabled) return;
        const video = getVideo();
        if (video) setVideoVolume(video, 0.05);
    }
    function restoreVolumeBeforeQuietMode() {
        const video = getVideo();
        if (!video) return;
        setVideoVolume(video, GM_getValue(QUIET_PREVIOUS_VOLUME_KEY, 1));
    }
    function setQuietMode(enabled, restoreWhenDisabled = true) {
        quietModeEnabled = Boolean(enabled);
        if (quietModeEnabled) applyQuietMode();
        else if (restoreWhenDisabled) restoreVolumeBeforeQuietMode();
    }

    document.addEventListener('keydown', event => {
        if (event.code !== 'KeyG' || isTyping(event) || !loopEnabled) return;
        consume(event);
        if (!event.repeat && !gifExportBusy && !videoExportBusy) exportLoopGif();
    }, true);
    document.addEventListener('keydown', event => {
        if (event.code !== 'KeyF' || isTyping(event) || !loopEnabled) return;
        consume(event);
        if (!event.repeat && !videoExportBusy && !gifExportBusy) exportLoopVideo();
    }, true);
    document.addEventListener('keydown', event => {
        if (event.code !== 'KeyP' || isTyping(event)) return;
        const video = getVideo();
        if (!video || !pointerIsOverVideo(video)) return;
        consume(event);
        if (event.repeat) return;

        const enable = !quietModeEnabled;
        if (enable) GM_setValue(QUIET_PREVIOUS_VOLUME_KEY, video.volume);
        setQuietMode(enable);
        GM_setValue(QUIET_MODE_KEY, enable);
    }, true);
    document.addEventListener('volumechange', event => {
        if (event.target !== getVideo() || quietModeApplying || !quietModeEnabled) return;
        applyQuietMode();
    }, true);
    document.addEventListener('loadedmetadata', event => {
        if (event.target === getVideo()) applyQuietMode();
    }, true);
    document.addEventListener('play', event => {
        if (event.target === getVideo()) {
            applyQuietMode();
            if (loopEnabled) startLoopCycleAnimation();
        }
    }, true);
    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(QUIET_MODE_KEY, (_name, _oldValue, newValue) => {
            setQuietMode(Boolean(newValue));
        });
        GM_addValueChangeListener(HIDE_CURSOR_KEY, (_name, _oldValue, newValue) => {
            hideCursorEnabled = Boolean(newValue);
            applyCursorPreference();
        });
    }
    applyQuietMode();

    // Fizyczna spacja niezawodnie przełącza Play/Pause, także przed pierwszym
    // uruchomieniem. Obsługa na window wyprzedza skróty samego playera.
    window.addEventListener('keydown', event => {
        if (!event.isTrusted || event.code !== 'Space' || isTyping(event)) return;
        const video = getVideo();
        if (!video) return;
        consume(event);
        if (!event.repeat) togglePlayback(video);
    }, true);
    window.addEventListener('keyup', event => {
        if (event.isTrusted && event.code === 'Space' && !isTyping(event)) consume(event);
    }, true);

    // Jeden punkt obsługi LPM: obraz przełącza Play/Pause, a timeline
    // zapowiada ręczny seek aktywnej pętli.
    window.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const video = getVideo();
        if (event.target === video) {
            consume(event);
            togglePlayback(video);
            return;
        }
        if (loopEnabled && event.target instanceof Element && event.target.closest(TIMELINE)) {
            manualTimelineSeekUntil = performance.now() + TIMELINE_SEEK_WINDOW_MS;
        }
    }, true);
    document.addEventListener('seeking', event => {
        if (event.target === getVideo() && loopEnabled &&
            performance.now() <= manualTimelineSeekUntil) {
            rebaseLoopAtPlayhead(event.target);
            manualTimelineSeekUntil = 0;
        }
    }, true);
    // Nie dopuszczamy do drugiego przełączenia przez zwykłą obsługę kliknięcia.
    for (const type of ['mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, event => {
            if (event.button === 0 && event.target === getVideo()) consume(event);
        }, true);
    }

    document.addEventListener('keydown', event => {
        if (isTyping(event)) return;
        const video = getVideo();
        if (!video) return;
        if (event.code === 'KeyZ' || event.code === 'KeyX') {
            if (event.code === 'KeyZ') zPressed = true;
            else xPressed = true;
            consume(event);
            return;
        }
        if (event.code !== 'KeyL' && event.code !== 'ArrowLeft' &&
            event.code !== 'ArrowRight') return;
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        consume(event);
        if (loopVideo !== video) {
            loopEnabled = false;
            manualTimelineSeekUntil = 0;
            hideLoopIndicator();
        }

        if (event.code === 'KeyL') {
            if (event.repeat) return;
            loopEnabled = !loopEnabled;
            if (!loopEnabled) {
                manualTimelineSeekUntil = 0;
                hideLoopIndicator();
                return;
            }
            loopVideo = video;
            if (video.duration >= LOOP_DEFAULT_RADIUS * 2) {
                // Przesuwamy całe okno przy krawędziach filmu, dzięki czemu
                // start zawsze wynosi dokładnie [-1 1].
                const loopCenter = clamp(
                    video.currentTime,
                    LOOP_DEFAULT_RADIUS,
                    video.duration - LOOP_DEFAULT_RADIUS
                );
                loopStart = loopCenter - LOOP_DEFAULT_RADIUS;
                loopEnd = loopCenter + LOOP_DEFAULT_RADIUS;
                loopDisplayStart = -LOOP_DEFAULT_RADIUS;
                loopDisplayEnd = LOOP_DEFAULT_RADIUS;
            } else {
                loopStart = 0;
                loopEnd = video.duration;
                loopDisplayStart = -video.duration / 2;
                loopDisplayEnd = video.duration / 2;
            }
            video.currentTime = loopStart;
            if (video.paused) play(video);
            showLoopIndicator();
            return;
        }

        const right = event.code === 'ArrowRight';
        // Z steruje lewą granicą, X prawą. W obu przypadkach ← przesuwa
        // wskazaną granicę w lewo, a → w prawo; pętla zachowuje min. 1 s.
        if (loopEnabled && zPressed) {
            if (right) {
                if (loopEnd - loopStart >= LOOP_MIN_LENGTH + LOOP_EDGE_STEP - EPSILON) {
                    loopStart += LOOP_EDGE_STEP;
                    loopDisplayStart += LOOP_EDGE_STEP;
                }
            } else {
                if (loopStart >= LOOP_EDGE_STEP - EPSILON) {
                    loopStart = Math.max(0, loopStart - LOOP_EDGE_STEP);
                    loopDisplayStart -= LOOP_EDGE_STEP;
                }
            }
            keepPlayheadInsideLoop(video);
            showLoopIndicator();
            return;
        }
        if (loopEnabled && xPressed) {
            if (right) {
                if (video.duration - loopEnd >= LOOP_EDGE_STEP - EPSILON) {
                    loopEnd = Math.min(video.duration, loopEnd + LOOP_EDGE_STEP);
                    loopDisplayEnd += LOOP_EDGE_STEP;
                }
            } else {
                if (loopEnd - loopStart >= LOOP_MIN_LENGTH + LOOP_EDGE_STEP - EPSILON) {
                    loopEnd -= LOOP_EDGE_STEP;
                    loopDisplayEnd -= LOOP_EDGE_STEP;
                }
            }
            keepPlayheadInsideLoop(video);
            showLoopIndicator();
            return;
        }

        const offset = (right ? 1 : -1) * (event.ctrlKey ? 30 : event.shiftKey ? 1 : 10);
        if (loopEnabled) {
            const length = Math.min(loopEnd - loopStart, video.duration);
            loopStart = clamp(loopStart + offset, 0, video.duration - length);
            loopEnd = loopStart + length;
            keepPlayheadInsideLoop(video);
            showLoopIndicator();
        } else video.currentTime = clamp(video.currentTime + offset, 0, video.duration);
    }, true);

    document.addEventListener('keyup', event => {
        if (event.code !== 'KeyZ' && event.code !== 'KeyX') return;
        const wasPressed = event.code === 'KeyZ' ? zPressed : xPressed;
        if (event.code === 'KeyZ') zPressed = false;
        else xPressed = false;
        if (wasPressed && !isTyping(event)) consume(event);
    }, true);
    window.addEventListener('blur', () => { zPressed = false; xPressed = false; });

    function enforceLoop() {
        const video = getVideo();
        if (!loopEnabled || video !== loopVideo || !video || video.seeking) return;
        if (video.currentTime >= loopEnd || video.currentTime < loopStart) {
            const ended = video.ended;
            video.currentTime = loopStart;
            if (ended) play(video);
        }
    }
    document.addEventListener('timeupdate', event => {
        if (event.target === getVideo()) enforceLoop();
    }, true);
    // Podczas odtwarzania granica jest dodatkowo sprawdzana przez istniejącą
    // animację wskaźnika, więc nie potrzebujemy stałego timera co 25 ms.

    // Stary sprite jest wyłączony przez CSS; watchdog dodatkowo usuwa
    // widoczność wymuszoną przez inline !important. Reakcja najpóźniej po 2 s.
    function hideOldPreview() {
        document.querySelectorAll(`${OLD_PREVIEW}, ${OLD_SHADOW}`).forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
        });
    }
    hideOldPreview();
    setInterval(hideOldPreview, PREVIEW_HIDE_MS);

    document.querySelector('#TEST-LIVE-PREVIEW')?.remove();
    document.querySelector('#fluidpilot-live-preview-box')?.remove();
    const box = document.createElement('div');
    box.id = 'fluidpilot-live-preview-box';
    const preview = document.createElement('video');
    preview.id = 'fluidpilot-live-preview-video';
    preview.muted = true;
    preview.defaultMuted = true;
    preview.volume = 0;
    preview.preload = 'auto';
    preview.playsInline = true;
    preview.disablePictureInPicture = true;
    const label = document.createElement('div');
    label.id = 'fluidpilot-live-preview-time';
    box.append(preview, label);
    document.body.append(box);

    let source = '';
    let fastRequestedTime = null;
    let exactRequestedTime = null;
    let seekBusy = false;
    let hideTimer = null;
    let settleTimer = null;
    let animationFrame = null;

    function hidePreview() {
        clearTimeout(hideTimer);
        clearTimeout(settleTimer);
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        hideTimer = null;
        settleTimer = null;
        animationFrame = null;
        box.style.display = 'none';
        fastRequestedTime = null;
        exactRequestedTime = null;
    }
    function armHide() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hidePreview, PREVIEW_HIDE_MS);
    }
    function formatTime(time) {
        const seconds = Math.floor(Math.max(0, time));
        const h = Math.floor(seconds / 3600);
        const m = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        return (h ? h + ':' : '') + m + ':' + s;
    }

    function syncPreviewSource(mainVideo) {
        if (!mainVideo?.currentSrc || source === mainVideo.currentSrc) return !!source;
        source = mainVideo.currentSrc;
        seekBusy = false;
        fastRequestedTime = null;
        exactRequestedTime = null;
        preview.src = source;
        preview.load();
        return true;
    }

    // Tylko jeden seek naraz. Podczas ruchu fastSeek szybko pokazuje pobliską
    // klatkę kluczową. Po 120 ms bez ruchu currentTime dociąga dokładną klatkę.
    function performSeek() {
        if (seekBusy || preview.seeking || preview.readyState < 1 ||
            !Number.isFinite(preview.duration)) return;
        const exact = exactRequestedTime !== null;
        const request = exact ? exactRequestedTime : fastRequestedTime;
        if (request === null) return;
        const target = clamp(request, 0, preview.duration);
        if (exact) exactRequestedTime = null;
        else fastRequestedTime = null;
        if (Math.abs(preview.currentTime - target) < EPSILON) return;
        seekBusy = true;
        try {
            if (!exact && typeof preview.fastSeek === 'function') preview.fastSeek(target);
            else preview.currentTime = target;
        } catch (error) {
            seekBusy = false;
            hidePreview();
            console.warn('[FluidPilot] Preview seek:', error);
        }
    }
    preview.addEventListener('seeked', () => {
        seekBusy = false;
        performSeek();
    });
    preview.addEventListener('loadedmetadata', () => {
        seekBusy = false;
        // Rozgrzanie dekodera zmniejsza opóźnienie pierwszego podglądu.
        if (fastRequestedTime === null && exactRequestedTime === null) {
            const mainVideo = getVideo();
            if (mainVideo) fastRequestedTime = mainVideo.currentTime;
        }
        performSeek();
    });
    preview.addEventListener('error', () => {
        seekBusy = false;
        hidePreview();
        console.warn('[FluidPilot] Nie można odczytać źródła preview.', preview.error);
    });

    function requestPreviewFrame(time) {
        // Nowy ruch unieważnia dokładny seek zaplanowany dla starej pozycji.
        exactRequestedTime = null;
        fastRequestedTime = time;
        if (animationFrame === null) {
            animationFrame = requestAnimationFrame(() => {
                animationFrame = null;
                performSeek();
            });
        }
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            settleTimer = null;
            fastRequestedTime = null;
            exactRequestedTime = time;
            performSeek();
        }, PREVIEW_SETTLE_MS);
    }

    function movePreview(event) {
        pointerKnown = true;
        pointerX = event.clientX;
        pointerY = event.clientY;

        const timeline = document.querySelector(TIMELINE);
        const mainVideo = getVideo();
        if (!timeline || !mainVideo) {
            hidePreview();
            return;
        }
        const duration = mainVideo.duration;
        const rect = timeline.getBoundingClientRect();
        const insideExpandedTimeline =
            event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top - PREVIEW_HOT_ZONE_PX &&
            event.clientY <= rect.bottom + PREVIEW_HOT_ZONE_PX;
        if (!insideExpandedTimeline) {
            if (box.style.display !== 'none') hidePreview();
            return;
        }
        if (!Number.isFinite(duration) || duration <= 0 || rect.width <= 0 ||
            !mainVideo.currentSrc) return;

        // Każdy pointermove jest mapowany bez zaokrąglania do klatek/sprite'ów.
        const time = clamp((event.clientX - rect.left) / rect.width, 0, 1) * duration;
        syncPreviewSource(mainVideo);
        // Element musi należeć do drzewa pełnoekranowego odtwarzacza.
        const fullscreen = document.fullscreenElement;
        const host = fullscreen && fullscreen !== mainVideo ? fullscreen : document.body;
        if (box.parentNode !== host) host.append(box);

        const width = Math.min(PREVIEW_MAX_WIDTH_PX, Math.max(1, window.innerWidth - 16));
        const height = width * 9 / 16;
        box.style.width = width + 'px';
        box.style.height = height + 'px';
        box.style.left = clamp(event.clientX - width / 2, 8,
            Math.max(8, window.innerWidth - width - 8)) + 'px';
        box.style.top = Math.max(0, rect.top - height - 12) + 'px';
        label.textContent = formatTime(time);
        box.style.display = 'block';
        requestPreviewFrame(time);
        armHide();
        hideOldPreview();
    }
    // Delegacja obsługuje również odtwarzacz dodany lub wymieniony później.
    document.addEventListener('pointermove', movePreview, true);
    // Ładujemy źródło wcześniej, zanim użytkownik po raz pierwszy najedzie.
    syncPreviewSource(getVideo());
    document.addEventListener('loadedmetadata', event => {
        if (event.target === getVideo()) syncPreviewSource(event.target);
    }, true);
    document.addEventListener('fullscreenchange', () => {
        hidePreview();
        if (loopEnabled) showLoopIndicator();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { zPressed = false; xPressed = false; hidePreview(); }
    });
    document.addEventListener('emptied', event => {
        if (event.target === getVideo()) {
            loopEnabled = false;
            manualTimelineSeekUntil = 0;
            hideLoopIndicator();
            hidePreview();
        }
    }, true);
    window.addEventListener('blur', hidePreview);
    window.addEventListener('resize', () => {
        hidePreview();
        positionLoopIndicator();
    });
    window.addEventListener('scroll', () => {
        hidePreview();
        positionLoopIndicator();
    }, true);
})();
}).catch(error => console.error('[FluidPilot] Initialization:', error));
