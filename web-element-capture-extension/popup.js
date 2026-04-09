document.addEventListener('DOMContentLoaded', () => {
    const selectBtn = document.getElementById('select-btn');
    const captureView = document.getElementById('capture-view');
    const successView = document.getElementById('success-view');
    const resetBtn = document.getElementById('reset-btn');

    // Copy buttons
    const copyHtmlBtn = document.getElementById('copy-html-btn');
    const copyCssBtn = document.getElementById('copy-css-btn');
    const copyJsBtn = document.getElementById('copy-js-btn');

    let capturedData = {
        html: '',
        css: '',
        js: ''
    };

    // --- State Management ---
    const showSuccessView = () => {
        captureView.classList.add('hidden');
        successView.classList.remove('hidden');
    };

    const showCaptureView = () => {
        successView.classList.add('hidden');
        captureView.classList.remove('hidden');
        resetCopyButtons();
        selectBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg> Select Element
        `;
        selectBtn.disabled = false;
    };

    const resetCopyButtons = () => {
        const btns = [copyHtmlBtn, copyCssBtn, copyJsBtn];
        btns.forEach(btn => {
            const originalText = btn.id.replace('copy-', '').replace('-btn', '').toUpperCase();
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 3H4V16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 7H20V21H8V7Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg> Copy ${originalText}`;
            btn.classList.remove('copied');
        });
    };

    // Restore state from storage on open
    chrome.storage.local.get('divGrabPayload', (result) => {
        if (result.divGrabPayload) {
            capturedData = result.divGrabPayload;
            showSuccessView();
        }
    });

    // --- Select Element Interaction ---
    selectBtn.addEventListener('click', async () => {
        // Update button UI
        selectBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="spin">
                <path d="M12 2V6M12 18V22M6 12H2M22 12H18M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg> Selecting...
        `;
        selectBtn.disabled = true;

        // Clear previous runs
        await chrome.storage.local.remove('divGrabPayload');

        // Get active tab using chrome.tabs API
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Ensure content scripts are injected and trigger selection
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        }, () => {
            chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['content.css']
            }, () => {
                chrome.tabs.sendMessage(tab.id, { action: 'START_SELECTION' });
                // NOTE: We could close the popup automatically here, but Chrome usually does it anyway 
                // when the user clicks onto the web page to select an element!
            });
        });
    });

    // --- Copy Interactions ---
    const handleCopy = async (btn, text, typeLabel) => {
        if (!text) {
            btn.innerHTML = `No ${typeLabel} Found`;
            setTimeout(() => resetCopyButtons(), 2000);
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg> Copied!`;
            btn.classList.add('copied');
            setTimeout(() => resetCopyButtons(), 2000);
        } catch (err) {
            console.error('Failed to copy', err);
            btn.innerHTML = 'Failed to copy';
        }
    };

    copyHtmlBtn.addEventListener('click', () => handleCopy(copyHtmlBtn, capturedData.html, 'HTML'));
    copyCssBtn.addEventListener('click', () => handleCopy(copyCssBtn, capturedData.css, 'CSS'));
    copyJsBtn.addEventListener('click', () => handleCopy(copyJsBtn, capturedData.js, 'JS'));

    resetBtn.addEventListener('click', () => {
        chrome.storage.local.remove('divGrabPayload', () => {
            showCaptureView();
        });
    });

    const reportLink = document.getElementById('report-link');
    reportLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: reportLink.href });
    });
});
