// Injected content script for DivGrab

(function () {
    if (typeof window.divgrabInjected !== 'undefined') return;
    window.divgrabInjected = true;

    const isSelecting = { current: false };
    const currentHoveredElement = { current: null };

    // The main style for the hover effect is handled via `content.css`
    const HOVER_CLASS = 'divgrab-highlight-overlay';

    function onMouseOver(e) {
        if (!isSelecting.current) return;
        e.stopPropagation();

        if (currentHoveredElement.current) {
            currentHoveredElement.current.classList.remove(HOVER_CLASS);
        }

        currentHoveredElement.current = e.target;
        currentHoveredElement.current.classList.add(HOVER_CLASS);
    }

    function onMouseOut(e) {
        if (!isSelecting.current) return;
        e.stopPropagation();

        if (currentHoveredElement.current) {
            currentHoveredElement.current.classList.remove(HOVER_CLASS);
            currentHoveredElement.current = null;
        }
    }

    async function onClick(e) {
        if (!isSelecting.current) return;

        e.preventDefault();
        e.stopPropagation();

        // Stop selection mode
        stopSelectionMode();

        const targetElement = e.target;

        // Remove the hover class before extraction so it's not part of the output
        targetElement.classList.remove(HOVER_CLASS);

        // Extract Data
        const payload = extractElementData(targetElement);

        try {
            await chrome.storage.local.set({ divGrabPayload: payload });

            // Show success toast on the webpage
            const toast = document.createElement('div');
            toast.innerHTML = `
                <div style="position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#000;color:#fff;padding:16px 24px;border-radius:8px;font-family:sans-serif;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);display:flex;align-items:center;gap:12px;">
                    <div style="background:#10b981;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">✓</div>
                    <div>
                        <div style="font-weight:bold;font-size:15px;margin-bottom:4px;">Element Captured!</div>
                        <div style="font-size:13px;opacity:0.9;">Open DivGrab extension to copy code.</div>
                    </div>
                </div>
            `;
            document.body.appendChild(toast);

            setTimeout(() => {
                const toastDiv = toast.firstElementChild;
                if (toastDiv) {
                    toastDiv.style.transition = 'opacity 0.4s';
                    toastDiv.style.opacity = '0';
                }
                setTimeout(() => toast.remove(), 400);
            }, 4000);

        } catch (err) {
            console.error("Error saving data:", err);
        }
    }

    function startSelectionMode() {
        if (isSelecting.current) return;
        isSelecting.current = true;
        document.body.classList.add('divgrab-selection-mode');

        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
        document.addEventListener('click', onClick, true);
    }

    function stopSelectionMode() {
        isSelecting.current = false;
        document.body.classList.remove('divgrab-selection-mode');

        if (currentHoveredElement.current) {
            currentHoveredElement.current.classList.remove(HOVER_CLASS);
            currentHoveredElement.current = null;
        }

        document.removeEventListener('mouseover', onMouseOver, true);
        document.removeEventListener('mouseout', onMouseOut, true);
        document.removeEventListener('click', onClick, true);
    }

    // --- Main Extraction Logic --- //

    function extractElementData(element) {
        const prefix = 'dg-' + Math.random().toString(36).substring(2, 6) + '-';
        const clone = element.cloneNode(true);

        const originalNodes = [element, ...element.querySelectorAll('*')];
        const clonedNodes = [clone, ...clone.querySelectorAll('*')];

        let generatedCSS = '';
        let usedFonts = new Set();
        let usedAnimations = new Set();

        for (let i = 0; i < originalNodes.length; i++) {
            const origNode = originalNodes[i];
            const cloneNode = clonedNodes[i];

            const computedStyle = window.getComputedStyle(origNode);
            const uniqueClass = `${prefix}${i}`;
            cloneNode.classList.add(uniqueClass);

            let rule = extractRelevantStyles(computedStyle);

            // Inherit parent background for the root element if it is transparent
            if (i === 0) {
                let effectiveBg = computedStyle.getPropertyValue('background-color');
                if (!effectiveBg || effectiveBg === 'rgba(0, 0, 0, 0)' || effectiveBg === 'transparent') {
                    let parent = origNode.parentElement;
                    while (parent) {
                        const parentStyle = window.getComputedStyle(parent);
                        const parentBg = parentStyle.getPropertyValue('background-color');
                        let hasBgImage = parentStyle.getPropertyValue('background-image');

                        // We will grab the background-color if it's there
                        if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
                            rule += `  background-color: ${parentBg} !important;\n`;
                            break;
                        }
                        // If there is only a background image/gradient but no color, we might miss the exact look,
                        // but color usually acts as a reliable fallback.
                        parent = parent.parentElement;
                    }
                }
            }

            // Make URLs absolute
            ['src', 'href'].forEach(attr => {
                const val = origNode.getAttribute(attr);
                if (val) {
                    try {
                        const absUrl = new URL(val, window.location.href).href;
                        cloneNode.setAttribute(attr, absUrl);
                    } catch (e) { }
                }
            });

            // Handle srcset absolute URLs
            const srcset = origNode.getAttribute('srcset');
            if (srcset) {
                try {
                    const newSrcset = srcset.split(',').map(s => {
                        const parts = s.trim().split(' ').filter(Boolean);
                        if (!parts[0]) return '';
                        const absUrl = new URL(parts[0], window.location.href).href;
                        return parts.length > 1 ? `${absUrl} ${parts[1]}` : absUrl;
                    }).filter(Boolean).join(', ');
                    cloneNode.setAttribute('srcset', newSrcset);
                } catch (e) { }
            }

            // Collect fonts and animations
            const fontFamily = computedStyle.getPropertyValue('font-family');
            if (fontFamily) {
                fontFamily.split(',').forEach(f => {
                    const cleanFont = f.trim().replace(/['"]/g, '');
                    if (cleanFont) usedFonts.add(cleanFont);
                });
            }

            const animationName = computedStyle.getPropertyValue('animation-name');
            if (animationName && animationName !== 'none') {
                animationName.split(',').forEach(a => usedAnimations.add(a.trim()));
            }

            cloneNode.removeAttribute('id');
            cloneNode.removeAttribute('style');
            cloneNode.className = uniqueClass;

            generatedCSS += `.${uniqueClass} {\n${rule}}\n`;

            // Extract pseudo-elements (e.g. icons, arrows)
            ['::before', '::after'].forEach(pseudo => {
                const pseudoStyle = window.getComputedStyle(origNode, pseudo);
                const content = pseudoStyle.getPropertyValue('content');
                if (content && content !== 'none' && content !== 'normal') {
                    const pseudoRule = extractRelevantStyles(pseudoStyle);
                    if (pseudoRule.trim()) {
                        generatedCSS += `.${uniqueClass}${pseudo} {\n  content: ${content};\n${pseudoRule}}\n`;
                    }
                }
            });
        }

        // --- Extract Fonts and Keyframes ---
        let extraCSS = '';

        function extractRules(rules) {
            if (!rules) return;
            for (let j = 0; j < rules.length; j++) {
                const rule = rules[j];
                try {
                    if (rule.type === CSSRule.KEYFRAMES_RULE) {
                        if (usedAnimations.has(rule.name)) {
                            extraCSS += rule.cssText + '\n\n';
                        }
                    } else if (rule.type === CSSRule.FONT_FACE_RULE) {
                        const fontFam = rule.style.getPropertyValue('font-family').replace(/['"]/g, '');
                        if (usedFonts.has(fontFam)) {
                            extraCSS += rule.cssText + '\n\n';
                        }
                    } else if (rule.cssRules) {
                        // Recursively handle @media, @supports, etc.
                        extractRules(rule.cssRules);
                    }
                } catch (e) {
                    // Ignore individual rule access errors
                }
            }
        }

        try {
            for (let i = 0; i < document.styleSheets.length; i++) {
                let sheet = document.styleSheets[i];
                try {
                    // Try to access rules. Might fail due to CORS for external domains.
                    extractRules(sheet.cssRules || sheet.rules);
                } catch (e) {
                    // CORS error on stylesheet, ignore
                    console.warn("Could not read stylesheet", sheet.href);
                }
            }
        } catch (e) {
            console.error("Error iterating stylesheets:", e);
        }

        if (extraCSS) {
            generatedCSS = "/* Extracted Fonts & Animations */\n" + extraCSS + "\n/* Element Styles */\n" + generatedCSS;
        }

        let jsCode = '';
        const scriptTags = clone.querySelectorAll('script');
        scriptTags.forEach(script => {
            if (script.innerText) {
                jsCode += script.innerText + '\n';
            }
            script.remove();
        });

        for (let i = 0; i < originalNodes.length; i++) {
            const origNode = originalNodes[i];
            const attrs = origNode.attributes;
            for (let j = 0; j < attrs.length; j++) {
                const attr = attrs[j];
                if (attr.name.startsWith('on')) {
                    jsCode += `/* Inline ${attr.name} handler from element */\n`;
                    jsCode += `// ${attr.value}\n`;
                    clonedNodes[i].removeAttribute(attr.name);
                }
            }
        }

        // --- Extract Font Links from Head ---
        let fontLinks = '';
        document.head.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]').forEach(link => {
            if (link.href && (link.href.includes('font') || link.href.includes('typekit') || link.href.includes('gstatic'))) {
                // clone link to remove unnecessary attributes just in case, or just take outerHTML
                const tempLink = link.cloneNode();
                fontLinks += tempLink.outerHTML + '\n';
            }
        });

        let finalHTML = clone.outerHTML;
        if (fontLinks.trim()) {
            finalHTML = `<!-- Injected Fonts -->\n${fontLinks}\n<!-- Element HTML -->\n${finalHTML}`;
        }

        return {
            html: finalHTML,
            css: generatedCSS,
            js: jsCode.trim() || '/* No JavaScript found within the selected element.\n   Note: Modern framework (React/Vue) event listeners cannot be automatically extracted. */'
        };
    }

    function extractRelevantStyles(computedStyle) {
        let cssText = '';
        const layoutProps = [
            'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
            'flex-direction', 'justify-content', 'align-items', 'align-content', 'flex-wrap', 'gap',
            'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'justify-self', 'place-content', 'place-items', 'place-self',
            'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-column', 'grid-row', 'grid-area',
            'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
            'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
            'margin', 'padding', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'box-sizing', 'float', 'clear', 'object-fit', 'object-position'
        ];
        const visualProps = [
            'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
            'border', 'border-radius', 'border-top', 'border-right', 'border-bottom', 'border-left',
            'border-color', 'border-width', 'border-style',
            'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'line-height',
            'letter-spacing', 'word-spacing', 'text-align', 'text-indent', 'vertical-align',
            'text-decoration', 'text-transform', 'text-shadow', 'white-space', 'word-break', 'overflow-wrap', 'text-overflow',
            'font-variation-settings', 'font-feature-settings', '-webkit-font-smoothing', '-moz-osx-font-smoothing',
            '-webkit-line-clamp', '-webkit-box-orient', '-webkit-text-fill-color', '-webkit-text-stroke', 'mix-blend-mode',
            'opacity', 'box-shadow', 'transform', 'transform-origin', 'transition', 'animation', 'animation-name',
            'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count',
            'animation-direction', 'animation-fill-mode', 'animation-play-state', 'cursor', 'overflow', 'overflow-x', 'overflow-y',
            'visibility', 'clip-path', 'aspect-ratio', 'backdrop-filter', 'mask', 'mask-image',
            'fill', 'stroke', 'stroke-width'
        ];

        const propertiesToKeep = [...layoutProps, ...visualProps];

        const isNonDefault = (prop, value, computed) => {
            if (!value || value === 'none' || value === 'auto' || value === 'normal' || value === '0px' || value === '0s') {
                if (prop === 'display' && value !== 'inline' && value !== 'block') return true;
                if (prop === 'position' && value !== 'static') return true;
                if (prop === 'animation-name' && value !== 'none') return true;
                if (prop === 'flex' && value !== '0 1 auto') return true;
                if (prop === 'vertical-align' && value !== 'baseline') return true;
                return false;
            }
            if (prop === 'background-color' && (value === 'rgba(0, 0, 0, 0)' || value === 'transparent')) return false;
            if (prop.startsWith('border') && value.includes('none')) return false;
            if (prop === 'flex-shrink' && value === '1') return false;
            if (prop === 'flex-grow' && value === '0') return false;
            if (prop === '-webkit-box-orient' && (value === 'horizontal' || value === 'block-axis')) return false;
            if ((prop === '-webkit-font-smoothing' || prop === '-moz-osx-font-smoothing') && value === 'auto') return false;
            if (prop === 'fill' && value === '#000000') return false;
            if (prop === 'font-weight' && (value === '400' || value === 'normal')) return false;
            if (prop === 'text-overflow' && value === 'clip') return false;
            if (prop === '-webkit-line-clamp' && value === 'none') return false;
            return true;
        };

        propertiesToKeep.forEach(prop => {
            const val = computedStyle.getPropertyValue(prop);
            if (isNonDefault(prop, val, computedStyle)) {
                // If animation is actively affecting a property like transform/opacity,
                // exporting the instantaneous computed value might freeze it.
                // However, animation properties should override static ones in the output CSS.
                cssText += `  ${prop}: ${val};\n`;
            }
        });

        return cssText;
    }

    // Listen for popup messages
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'START_SELECTION') {
            startSelectionMode();
            sendResponse({ status: "started" });
        }
    });

})();
