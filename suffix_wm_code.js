var Module = {
    onRuntimeInitialized() {
        let fmIndex = null;
        let activeMatchPosition = -1;
        let cachedPattern = '';
        let cachedMatchCount = 0;
        let highlightTimer;
        let resizeTimer;

        const searchInput = document.getElementById('searchPattern');
        const displayArea = document.getElementById('displayArea');
        const charCountElement = document.getElementById('charCount');
        const matchCountElement = document.getElementById('matchCount');
        const currentMatchElement = document.getElementById('currentMatch');
        const container = document.getElementById('textContainer');
        const highlightOverlay = document.getElementById('highlightOverlay');
        const fileInput = document.getElementById('fileInput');
        const fileNameElement = document.getElementById('fileName');
        const loading = document.getElementById('loading');
        const previousButton = document.getElementById('previousMatch');
        const nextButton = document.getElementById('nextMatch');
        const searchHint = document.getElementById('searchHint');

        const charWidth = getCharWidth();

        fileInput.disabled = false;

        fileInput.addEventListener('change', function (event) {
            const file = event.target.files[0];

            if (!file) {
                return;
            }

            if (file.name.split('.').pop().toLowerCase() !== 'txt') {
                setAppStatus('txtファイルを選択してください', 'error');
                fileInput.value = '';
                return;
            }

            setBusy(true);
            setAppStatus('インデックスを作成中');

            const reader = new FileReader();

            reader.onload = function (loadEvent) {
                let text = loadEvent.target.result;

                if (!isValidText(text)) {
                    setAppStatus('unsigned charで扱えない文字が含まれています', 'error');
                    setBusy(false);
                    fileInput.value = '';
                    return;
                }

                text = text.replace(/\r?\n/g, ' ').replace(/ {2,}/g, ' ');

                try {
                    if (fmIndex) {
                        fmIndex.delete();
                        fmIndex = null;
                    }
                    fmIndex = new Module.FMindex(text);
                } catch (error) {
                    console.error('インデックスの作成に失敗しました:', error);
                    setAppStatus('インデックスの作成に失敗しました', 'error');
                    setBusy(false);
                    return;
                }

                displayArea.textContent = text;
                fileNameElement.textContent = file.name;
                charCountElement.textContent = formatNumber(text.length);
                searchInput.value = '';
                searchInput.disabled = false;
                container.scrollTop = 0;
                resetSearchState();
                searchHint.textContent = '検索文字列を入力してください';
                searchHint.classList.remove('is-error');
                setBusy(false);
                searchInput.focus();
            };

            reader.onerror = function (error) {
                console.error('ファイルの読み込みエラー:', error);
                setAppStatus('ファイルを読み込めませんでした', 'error');
                setBusy(false);
            };

            reader.readAsText(file);
        });

        searchInput.addEventListener('input', function () {
            activeMatchPosition = -1;
            currentMatchElement.textContent = '—';
            cachedPattern = '';
            cachedMatchCount = 0;
            updateNavigationState();
            debounceHighlightMatches(40);
        });

        searchInput.addEventListener('keydown', function (event) {
            if (event.key !== 'Enter' || event.isComposing) {
                return;
            }

            event.preventDefault();
            moveToMatch(event.shiftKey ? -1 : 1);
        });

        previousButton.addEventListener('click', function () {
            moveToMatch(-1);
        });

        nextButton.addEventListener('click', function () {
            moveToMatch(1);
        });

        container.addEventListener('scroll', function () {
            debounceHighlightMatches(80);
        });

        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(highlightMatches, 100);
        });

        window.addEventListener('beforeunload', function () {
            if (fmIndex) {
                fmIndex.delete();
            }
        });

        function setBusy(isBusy) {
            loading.hidden = !isBusy;
            fileInput.disabled = isBusy;
            searchInput.disabled = isBusy || !fmIndex;
            updateNavigationState();
        }

        function setAppStatus(message, state) {
            searchHint.textContent = message;
            searchHint.classList.toggle('is-error', state === 'error');
        }

        function resetSearchState() {
            activeMatchPosition = -1;
            cachedPattern = '';
            cachedMatchCount = 0;
            matchCountElement.textContent = '0';
            currentMatchElement.textContent = '—';
            highlightOverlay.replaceChildren();
            updateNavigationState();
        }

        function updateNavigationState() {
            const canNavigate = Boolean(fmIndex && searchInput.value.length > 0 && !searchInput.disabled);
            previousButton.disabled = !canNavigate;
            nextButton.disabled = !canNavigate;
        }

        function isValidText(text) {
            for (let i = 0; i < text.length; i++) {
                if (text.charCodeAt(i) > 255) {
                    return false;
                }
            }
            return true;
        }

        function formatNumber(value) {
            return value.toLocaleString('ja-JP');
        }

        function debounceHighlightMatches(delay) {
            clearTimeout(highlightTimer);
            highlightTimer = setTimeout(function () {
                highlightMatches();
            }, delay);
        }

        function highlightMatches(anchorPosition) {
            const pattern = searchInput.value;

            if (!fmIndex || pattern.length === 0 || !displayArea.firstChild) {
                matchCountElement.textContent = '0';
                searchHint.textContent = fmIndex ? '検索文字列を入力してください' : 'テキストファイルを選択してください';
                highlightOverlay.replaceChildren();
                return;
            }

            if (pattern !== cachedPattern) {
                cachedMatchCount = fmIndex.substrCount(pattern);
                cachedPattern = pattern;
                matchCountElement.textContent = formatNumber(cachedMatchCount);
                searchHint.textContent = cachedMatchCount > 0 ? 'Enterで次のマッチへ移動できます' : '一致する文字列はありません';
            }

            const visibleRange = getVisibleCharacterRange();
            let rangeStart = Math.max(visibleRange.start - 1500, 0);
            let rangeEnd = Math.min(visibleRange.end + 1000, displayArea.textContent.length);

            if (Number.isInteger(anchorPosition) && anchorPosition >= 0) {
                rangeStart = Math.min(rangeStart, Math.max(anchorPosition - 1500, 0));
                rangeEnd = Math.max(rangeEnd, Math.min(anchorPosition + pattern.length + 1000, displayArea.textContent.length));
            }

            const result = fmIndex.substrPositionLR(pattern, rangeStart, rangeEnd);
            const positions = [];

            try {
                for (let i = 0; i < result.size(); i++) {
                    positions.push(result.get(i));
                }
            } finally {
                result.delete();
            }

            createHighlightBoxes(positions, pattern.length);
        }

        function moveToMatch(direction) {
            const pattern = searchInput.value;
            const text = displayArea.textContent;

            if (!fmIndex || pattern.length === 0 || text.length === 0) {
                return;
            }

            let nextPosition;

            if (direction > 0) {
                const start = activeMatchPosition < 0 ? 0 : activeMatchPosition + 1;
                nextPosition = text.indexOf(pattern, start);
                if (nextPosition < 0 && start > 0) {
                    nextPosition = text.indexOf(pattern, 0);
                }
            } else {
                const start = activeMatchPosition < 0 ? text.length - pattern.length : activeMatchPosition - 1;
                nextPosition = text.lastIndexOf(pattern, start);
                if (nextPosition < 0) {
                    nextPosition = text.lastIndexOf(pattern);
                }
            }

            if (nextPosition < 0) {
                currentMatchElement.textContent = '該当なし';
                return;
            }

            activeMatchPosition = nextPosition;
            currentMatchElement.textContent = formatNumber(nextPosition + 1) + '文字目';
            scrollToPosition(nextPosition);
            requestAnimationFrame(function () {
                highlightMatches(nextPosition);
            });
        }

        function scrollToPosition(position) {
            const metrics = getLayoutMetrics();
            const targetLine = Math.floor(position / metrics.charsPerLine);
            const targetTop = metrics.paddingTop + (targetLine * metrics.lineHeight) - (container.clientHeight / 2) + (metrics.lineHeight / 2);

            container.scrollTo({
                top: Math.max(0, targetTop),
                left: 0,
                behavior: 'auto'
            });
        }

        function getCharWidth() {
            const span = document.createElement('span');
            span.style.visibility = 'hidden';
            span.style.position = 'absolute';
            span.style.fontFamily = 'monospace';
            span.style.fontSize = '16px';
            span.textContent = 'M';
            document.body.appendChild(span);
            const width = span.getBoundingClientRect().width;
            span.remove();
            return width;
        }

        function getLineHeight(element) {
            return parseFloat(getComputedStyle(element).lineHeight);
        }

        function createHighlightBoxes(positions, length) {
            const fragment = document.createDocumentFragment();
            const textNode = displayArea.firstChild;
            const containerRect = container.getBoundingClientRect();

            positions.forEach(function (position) {
                const range = document.createRange();

                try {
                    range.setStart(textNode, position);
                    range.setEnd(textNode, Math.min(position + length, textNode.length));
                } catch (error) {
                    console.error('ハイライト位置の計算に失敗しました:', error);
                    return;
                }

                Array.from(range.getClientRects()).forEach(function (rect) {
                    const highlight = document.createElement('div');
                    highlight.className = position === activeMatchPosition ? 'highlight-box is-active' : 'highlight-box';
                    highlight.style.top = (rect.top - containerRect.top + container.scrollTop) + 'px';
                    highlight.style.left = (rect.left - containerRect.left + container.scrollLeft) + 'px';
                    highlight.style.width = rect.width + 'px';
                    highlight.style.height = rect.height + 'px';
                    fragment.appendChild(highlight);
                });

                range.detach();
            });

            highlightOverlay.replaceChildren(fragment);
        }

        function getVisibleCharacterRange() {
            const metrics = getLayoutMetrics();
            const firstVisibleLine = Math.floor(Math.max(container.scrollTop - metrics.paddingTop, 0) / metrics.lineHeight);
            const visibleLines = Math.ceil(container.clientHeight / metrics.lineHeight) + 1;
            const textLength = displayArea.textContent.length;

            return {
                start: Math.min(firstVisibleLine * metrics.charsPerLine, textLength),
                end: Math.min((firstVisibleLine + visibleLines) * metrics.charsPerLine, textLength)
            };
        }

        function getLayoutMetrics() {
            const displayStyle = getComputedStyle(displayArea);
            const horizontalPadding = parseFloat(displayStyle.paddingLeft) + parseFloat(displayStyle.paddingRight);
            const contentWidth = Math.max(displayArea.clientWidth - horizontalPadding, charWidth);
            const charsPerLine = Math.max(Math.floor(contentWidth / charWidth), 1);

            return {
                charsPerLine,
                lineHeight: getLineHeight(container),
                paddingTop: parseFloat(displayStyle.paddingTop)
            };
        }
    },

    onAbort(reason) {
        const searchHint = document.getElementById('searchHint');

        if (searchHint) {
            searchHint.classList.add('is-error');
            searchHint.textContent = 'Wasmの読み込みに失敗しました';
        }

        console.error('Wasmの初期化に失敗しました:', reason);
    }
};
