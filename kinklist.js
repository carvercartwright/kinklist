(function(){
    'use strict';

    var LEVELS = Kinklist.LEVELS;
    var FONT = '"Bricolage Grotesque", system-ui, sans-serif';

    var byId = function(id){ return document.getElementById(id); };
    var el = function(tag, className, text){
        var node = document.createElement(tag);
        if(className) node.className = className;
        if(text) node.textContent = text;
        return node;
    };

    var $list = byId('InputList');
    var $listType = byId('listType');

    // [{ name, fields: [], kinks: [{ name, desc, values: [], groups: [] }] }]
    var cats = [];
    // Every rating control in display order: { cat, kink, fi, node, slot }
    var groups = [];
    // Number of positions in a link for the current list
    var linkSize = 0;

    var parseKinksText = Kinklist.parseKinksText;

    function listToText(){
        return cats.map(function(cat){
            var lines = ['#' + cat.name, '(' + cat.fields.join(', ') + ')'];
            cat.kinks.forEach(function(kink){
                lines.push('* ' + kink.name);
                if(kink.desc) lines.push('? ' + kink.desc);
            });
            return lines.join('\n');
        }).join('\n\n');
    }

    // Replace the list, keeping ratings for anything that still exists
    function setList(newCats){
        var saved = new Map();
        groups.forEach(function(g){
            saved.set([g.cat.name, g.kink.name, g.cat.fields[g.fi]].join('\n'), g.kink.values[g.fi]);
        });
        newCats.forEach(function(cat){
            cat.kinks.forEach(function(kink){
                cat.fields.forEach(function(field, fi){
                    kink.values[fi] = saved.get([cat.name, kink.name, field].join('\n')) || 0;
                });
            });
        });
        cats = newCats;
        render();
    }

    /* Rendering */

    function render(){
        $list.textContent = '';
        groups = [];

        cats.forEach(function(cat){
            var $cat = el('section', 'category');
            $cat.append(el('h2', '', cat.name));

            if(cat.fields.length > 1) {
                var $fields = el('div', 'fields');
                cat.fields.forEach(function(field){ $fields.append(el('span', '', field)); });
                $cat.append($fields);
            }

            cat.kinks.forEach(function(kink){
                var $row = el('div', 'row');
                kink.groups = cat.fields.map(function(field, fi){
                    var $group = el('div', 'group');
                    $group.setAttribute('role', 'radiogroup');
                    $group.setAttribute('aria-label', kink.name + (cat.fields.length > 1 ? ', ' + field : ''));
                    if(cat.fields.length > 1) $group.dataset.field = field;
                    for(var level = 1; level < LEVELS.length; level++) {
                        var $dot = el('button', 'dot');
                        $dot.type = 'button';
                        $dot.dataset.level = level;
                        $dot.title = LEVELS[level];
                        $dot.setAttribute('role', 'radio');
                        $dot.setAttribute('aria-label', LEVELS[level]);
                        $group.append($dot);
                    }
                    var group = { cat: cat, kink: kink, fi: fi, node: $group, index: groups.length };
                    $group.group = group;
                    groups.push(group);
                    paint(group);
                    $row.append($group);
                    return group;
                });

                var $name = el('div', 'name', kink.name);
                $row.append($name);
                if(kink.desc) {
                    var $info = el('button', 'info', '?');
                    $info.type = 'button';
                    $info.setAttribute('aria-label', 'What is ' + kink.name + '?');
                    $info.setAttribute('aria-expanded', 'false');

                    // Keep the button on the same line as the last word
                    var lastWord = Math.max(kink.name.lastIndexOf(' '), kink.name.lastIndexOf('/')) + 1;
                    var $tail = el('span', 'name-tail', kink.name.substring(lastWord));
                    $tail.append($info);
                    $name.textContent = kink.name.substring(0, lastWord);
                    $name.append(el('wbr'), $tail);

                    var $desc = el('p', 'desc', kink.desc);
                    $desc.hidden = true;
                    $row.append($desc);
                }
                $cat.append($row);
            });
            $list.append($cat);
        });
        var layout = Kinklist.slots(cats, $listType.value);
        linkSize = layout.size;
        groups.forEach(function(g, i){ g.slot = layout.index[i]; });
        updateTally();
    }

    function paint(group){
        var value = group.kink.values[group.fi];
        var dots = group.node.children;
        group.node.classList.toggle('has-value', value > 0);
        for(var i = 0; i < dots.length; i++) {
            var checked = (i + 1 === value);
            dots[i].setAttribute('aria-checked', checked);
            // One tab stop per control; arrow keys move between dots
            dots[i].tabIndex = (checked || (!value && i === 0)) ? 0 : -1;
        }
    }

    function setValue(group, value){
        group.kink.values[group.fi] = value;
        paint(group);
        updateTally();
        updateUrl();
    }

    function updateTally(){
        var counts = LEVELS.map(function(){ return 0; });
        groups.forEach(function(g){ counts[g.kink.values[g.fi]]++; });

        var bars = byId('TallyBar').children;
        for(var i = 0; i < bars.length; i++) {
            bars[i].style.flexGrow = counts[i + 1];
        }
        byId('TallyText').textContent = (groups.length - counts[0]) + ' of ' + groups.length + ' rated';
    }

    $list.addEventListener('click', function(e){
        var $dot = e.target.closest('.dot');
        if($dot) {
            var group = $dot.parentNode.group;
            var level = Number($dot.dataset.level);
            // Clicking the current rating clears it
            setValue(group, group.kink.values[group.fi] === level ? 0 : level);
            return;
        }

        var $info = e.target.closest('.info');
        if($info) {
            var $desc = $info.closest('.row').querySelector('.desc');
            $desc.hidden = !$desc.hidden;
            $info.setAttribute('aria-expanded', !$desc.hidden);
        }
    });

    $list.addEventListener('keydown', function(e){
        if(!e.target.classList.contains('dot')) return;
        var $next = null;
        if(e.key === 'ArrowRight') $next = e.target.nextElementSibling;
        if(e.key === 'ArrowLeft') $next = e.target.previousElementSibling;
        if(!$next) return;
        e.preventDefault();
        $next.focus();
    });

    /* Link: ratings are packed into the URL hash */

    var encode = Kinklist.encode;
    var decode = Kinklist.decode;

    // Ratings laid out by link position
    function linkValues(){
        var values = [];
        for(var i = 0; i < linkSize; i++) values.push(0);
        groups.forEach(function(g){ values[g.slot] = g.kink.values[g.fi]; });
        return values;
    }

    function updateUrl(){
        var values = linkValues();
        var rated = values.some(Boolean);
        var url = location.pathname
                + ($listType.value !== 'classic' ? '?list=' + $listType.value : '')
                + (rated ? '#' + encode(values) : '');
        try {
            history.replaceState(null, '', url);
        }
        catch(e) {
            location.hash = rated ? encode(values) : '';
        }
        saveStore();
    }

    function parseHash(){
        var hash = location.hash.substring(1);
        if(hash.length < 10) return;

        var values = decode(hash);
        groups.forEach(function(g){
            g.kink.values[g.fi] = values[g.slot] || 0;
            paint(g);
        });
        updateTally();
    }

    // Pasting a link into a tab that already has the page open
    window.addEventListener('hashchange', function(){
        parseHash();
        checkLink();
    });

    /* Remember on this device: opt-in, kept in this browser's local storage only */

    var STORE_KEY = 'kinklist';
    var $remember = byId('Remember');
    // Text of an edited list, so it can be remembered too
    var customText = null;
    // True while showing ratings from someone else's link, so they never overwrite the saved ones
    var viewingLink = false;

    function readStore(){
        var store;
        try {
            store = JSON.parse(localStorage.getItem(STORE_KEY));
        }
        catch(e) {
            return null;
        }
        // Before version 2 the third and fourth ratings were Indifferent then Maybe
        if(store && store.v !== 2) {
            Object.keys(store.ratings).forEach(function(key){
                if(store.ratings[key] === 3) store.ratings[key] = 4;
                else if(store.ratings[key] === 4) store.ratings[key] = 3;
            });
            store.v = 2;
        }
        return store;
    }

    function ratingKey(g){
        return [g.cat.name, g.kink.name, g.cat.fields[g.fi]].join('\n');
    }

    function saveStore(){
        if(!$remember.checked || viewingLink) return;
        var store = readStore() || { v: 2, ratings: {} };
        groups.forEach(function(g){
            var value = g.kink.values[g.fi];
            if(value) store.ratings[ratingKey(g)] = value;
            else delete store.ratings[ratingKey(g)];
        });
        store.list = $listType.value;
        store.custom = customText;
        store.theme = document.documentElement.dataset.theme || null;
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        }
        catch(e) {}
    }

    function applyStore(store){
        groups.forEach(function(g){
            g.kink.values[g.fi] = store.ratings[ratingKey(g)] || 0;
            paint(g);
        });
        updateTally();
    }

    function checkLink(){
        var store = $remember.checked && readStore();
        viewingLink = !!store && location.hash.length > 10 && groups.some(function(g){
            return g.kink.values[g.fi] !== (store.ratings[ratingKey(g)] || 0);
        });
        byId('LinkNotice').hidden = !viewingLink;
    }

    $remember.addEventListener('change', function(){
        viewingLink = false;
        byId('LinkNotice').hidden = true;
        if($remember.checked) saveStore();
        else localStorage.removeItem(STORE_KEY);
    });
    byId('LinkBack').addEventListener('click', function(){
        viewingLink = false;
        byId('LinkNotice').hidden = true;
        applyStore(readStore());
        updateUrl();
    });
    byId('LinkKeep').addEventListener('click', function(){
        viewingLink = false;
        byId('LinkNotice').hidden = true;
        saveStore();
    });

    try {
        localStorage.setItem(STORE_KEY + '-test', '1');
        localStorage.removeItem(STORE_KEY + '-test');
    }
    catch(e) {
        byId('RememberLabel').hidden = true;
    }

    /* Colour scheme */

    var $theme = byId('Theme');
    $theme.value = document.documentElement.dataset.theme || 'midnight';
    if($theme.selectedIndex < 0) $theme.value = 'midnight';
    $theme.addEventListener('change', function(){
        document.documentElement.dataset.theme = $theme.value;
        try {
            sessionStorage.setItem('kinklist-theme', $theme.value);
        }
        catch(e) {}
        saveStore();
    });

    /* Choosing a list */

    function loadList(name){
        if(name === 'classic') return Promise.resolve(byId('Kinks').defaultValue);
        return fetch(name + '.txt').then(function(response){
            if(!response.ok) throw new Error('Could not load that list.');
            return response.text();
        });
    }

    $listType.addEventListener('change', function(){
        loadList($listType.value).then(function(text){
            customText = null;
            setList(parseKinksText(text));
            updateUrl();
        }).catch(function(e){
            alert(e.message);
        });
    });

    /* Edit list */

    var $edit = byId('EditDialog');
    byId('Edit').addEventListener('click', function(){
        byId('Kinks').value = listToText();
        byId('EditError').textContent = '';
        $edit.showModal();
    });
    byId('EditCancel').addEventListener('click', function(){ $edit.close(); });
    byId('KinksOK').addEventListener('click', function(){
        try {
            setList(parseKinksText(byId('Kinks').value));
        }
        catch(e) {
            byId('EditError').textContent = e.message;
            return;
        }
        customText = byId('Kinks').value;
        updateUrl();
        $edit.close();
    });

    /* Rate one by one */

    var $guide = byId('GuideDialog');
    var guide = { items: [], index: 0 };

    function showGuide(index){
        var count = guide.items.length;
        guide.index = (index + count) % count;
        var g = guide.items[guide.index];
        var value = g.kink.values[g.fi];

        byId('GuideCategory').textContent = g.cat.name;
        byId('GuideKink').textContent = g.kink.name;
        byId('GuideField').textContent = g.cat.fields.length > 1 ? g.cat.fields[g.fi] : '';
        byId('GuideDesc').textContent = g.kink.desc;
        byId('GuideCount').textContent = (guide.index + 1) + ' of ' + count;

        var options = byId('GuideOptions').children;
        for(var i = 0; i < options.length; i++) {
            options[i].setAttribute('aria-pressed', i === value);
        }
    }

    function chooseInGuide(level){
        setValue(guide.items[guide.index], level);
        showGuide(guide.index);
        setTimeout(function(){
            if(guide.index === guide.items.length - 1) $guide.close();
            else showGuide(guide.index + 1);
        }, 160);
    }

    LEVELS.forEach(function(label, level){
        var $option = el('button', 'option');
        $option.type = 'button';
        var $swatch = el('span', 'swatch');
        $swatch.dataset.level = level;
        $option.append($swatch, el('span', '', label), el('kbd', '', String(level)));
        $option.addEventListener('click', function(){ chooseInGuide(level); });
        byId('GuideOptions').append($option);
    });

    byId('StartBtn').addEventListener('click', function(){
        // Same order as before: every kink for the first field, then the next field
        guide.items = [];
        cats.forEach(function(cat){
            cat.fields.forEach(function(field, fi){
                cat.kinks.forEach(function(kink){ guide.items.push(kink.groups[fi]); });
            });
        });
        var firstUnrated = guide.items.findIndex(function(g){ return !g.kink.values[g.fi]; });
        showGuide(Math.max(0, firstUnrated));
        $guide.showModal();
    });
    byId('GuideBack').addEventListener('click', function(){ showGuide(guide.index - 1); });
    byId('GuideSkip').addEventListener('click', function(){ showGuide(guide.index + 1); });
    byId('GuideClose').addEventListener('click', function(){ $guide.close(); });

    $guide.addEventListener('keydown', function(e){
        if(e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;

        if(e.key === 'ArrowUp' || e.key === 'ArrowLeft') showGuide(guide.index - 1);
        else if(e.key === 'ArrowDown' || e.key === 'ArrowRight') showGuide(guide.index + 1);
        else if(e.key >= '0' && e.key < String(LEVELS.length)) chooseInGuide(Number(e.key));
        else return;
        e.preventDefault();
    });

    /* Copy link */

    byId('CopyLink').addEventListener('click', function(){
        var $btn = this;
        var done = function(){
            $btn.textContent = 'Link copied';
            setTimeout(function(){ $btn.textContent = 'Copy link'; }, 2000);
        };
        if(navigator.clipboard) {
            navigator.clipboard.writeText(location.href).then(done, function(){
                prompt('Copy this link', location.href);
            });
        }
        else {
            prompt('Copy this link', location.href);
        }
    });

    /* Save image */

    var $export = byId('ExportDialog');
    byId('Export').addEventListener('click', function(){ $export.showModal(); });
    byId('ExportCancel').addEventListener('click', function(){ $export.close(); });
    byId('ExportForm').addEventListener('submit', function(){
        var name = byId('ExportName').value.trim();
        document.fonts.load('700 18px ' + FONT).then(function(){ exportImage(name); });
    });

    var drawCallHandlers = {
        simpleTitle: function(context, drawCall){
            context.fillStyle = '#000000';
            context.font = "bold 18px " + FONT;
            context.fillText(drawCall.data, drawCall.x, drawCall.y + 5);
        },
        titleSubtitle: function(context, drawCall){
            context.fillStyle = '#000000';
            context.font = "bold 18px " + FONT;
            context.fillText(drawCall.data.category, drawCall.x, drawCall.y + 5);

            context.font = "italic 12px " + FONT;
            context.fillText(drawCall.data.fields.join(', '), drawCall.x, drawCall.y + 20);
        },
        kinkRow: function(context, drawCall){
            context.fillStyle = '#000000';
            context.font = "12px " + FONT;

            var x = drawCall.x + 5 + (drawCall.data.choices.length * 20);
            var y = drawCall.y - 6;
            context.fillText(drawCall.data.text, x, y);

            // Circles
            for(var i = 0; i < drawCall.data.choices.length; i++){
                drawCircle(context, 10 + drawCall.x + (i * 20), drawCall.y - 10, drawCall.data.choices[i]);
            }
        }
    };

    function drawCircle(context, x, y, color){
        context.beginPath();
        context.arc(x, y, 8, 0, 2 * Math.PI, false);
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        context.lineWidth = 1;
        context.stroke();
    }

    function exportImage(name){
        var rootStyle = getComputedStyle(document.documentElement);
        var colors = LEVELS.map(function(label, level){
            return rootStyle.getPropertyValue('--lv' + level).trim();
        });

        // Constants
        var scale = 2;
        var numCols = 6;
        var minColumnWidth = 250;
        var simpleTitleHeight = 35;
        var titleSubtitleHeight = 50;
        var rowHeight = 25;
        var offsets = {
            left: 10,
            right: 10,
            top: 50,
            bottom: 10
        };

        // Determine the height required for all categories and kinks,
        // and the column width required to fit the longest text
        var measure = document.createElement('canvas').getContext('2d');
        var columnWidth = minColumnWidth;
        var totalHeight = 0;
        cats.forEach(function(cat){
            var widths = [];

            measure.font = "bold 18px " + FONT;
            widths.push(measure.measureText(cat.name).width);
            if(cat.fields.length > 1) {
                measure.font = "italic 12px " + FONT;
                widths.push(measure.measureText(cat.fields.join(', ')).width);
            }
            measure.font = "12px " + FONT;
            cat.kinks.forEach(function(kink){
                widths.push(5 + (cat.fields.length * 20) + measure.measureText(kink.name).width);
            });
            columnWidth = Math.max(columnWidth, Math.ceil(Math.max.apply(null, widths)) + 10);

            totalHeight += (cat.fields.length === 1) ? simpleTitleHeight : titleSubtitleHeight;
            totalHeight += (cat.kinks.length * rowHeight);
        });

        // Initialize columns and drawStacks
        var columns = [];
        for(var i = 0; i < numCols; i++){
            columns.push({ height: 0, drawStack: []});
        }

        // Create drawcalls and place them in the drawStack
        // for the appropriate column
        var avgColHeight = totalHeight / numCols;
        var columnIndex = 0;
        cats.forEach(function(cat){
            var catHeight = (cat.fields.length === 1) ? simpleTitleHeight : titleSubtitleHeight;
            catHeight += (cat.kinks.length * rowHeight);

            // Determine which column to place this category in
            if((columns[columnIndex].height + (catHeight / 2)) > avgColHeight) columnIndex++;
            while(columnIndex >= numCols) columnIndex--;
            var column = columns[columnIndex];

            // Drawcall for title
            if(cat.fields.length < 2) {
                column.drawStack.push({ y: column.height, type: 'simpleTitle', data: cat.name });
                column.height += simpleTitleHeight;
            }
            else {
                column.drawStack.push({ y: column.height, type: 'titleSubtitle', data: {
                    category: cat.name,
                    fields: cat.fields
                }});
                column.height += titleSubtitleHeight;
            }

            // Drawcalls for kinks
            cat.kinks.forEach(function(kink){
                column.drawStack.push({ y: column.height, type: 'kinkRow', data: {
                    choices: kink.values.map(function(value){ return colors[value]; }),
                    text: kink.name
                }});
                column.height += rowHeight;
            });
        });

        var tallestColumnHeight = Math.max.apply(null, columns.map(function(column){ return column.height; }));
        var width = offsets.left + offsets.right + (columnWidth * numCols);
        var height = offsets.top + offsets.bottom + tallestColumnHeight;

        var canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        var context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, width, height);

        context.font = "bold 24px " + FONT;
        context.fillStyle = '#000000';
        context.fillText('Kinklist' + (name ? ' (' + name + ')' : ''), 5, 25);

        // Legend, right-aligned and spaced to fit each label
        context.font = "bold 13px " + FONT;
        var legendWidths = LEVELS.map(function(label){ return 15 + context.measureText(label).width + 28; });
        var legendX = width - 15 - legendWidths.reduce(function(sum, w){ return sum + w; }, 0) + 28;
        LEVELS.forEach(function(label, level){
            drawCircle(context, legendX, 17, colors[level]);
            context.fillStyle = '#000000';
            context.fillText(label, legendX + 15, 22);
            legendX += legendWidths[level];
        });

        columns.forEach(function(column, i){
            column.drawStack.forEach(function(drawCall){
                drawCall.x = offsets.left + (columnWidth * i);
                drawCall.y += offsets.top;
                drawCallHandlers[drawCall.type](context, drawCall);
            });
        });

        // Save canvas as a PNG download
        var filename = 'kinklist' + (name ? '-' + name.replace(/[^a-z0-9_-]+/gi, '_') : '') + '.png';
        canvas.toBlob(function(blob){
            if(!blob) {
                alert('The image could not be created.');
                return;
            }
            var url = URL.createObjectURL(blob);
            var $link = el('a');
            $link.href = url;
            $link.download = filename;
            document.body.append($link);
            $link.click();
            $link.remove();
            setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        }, 'image/png');
    }

    /* Compare: check the partner's link, then hand both sets of ratings to the comparison page */

    var $compare = byId('CompareDialog');

    function partnerHash(text){
        text = text.trim();
        if(!text) throw new Error("Paste your partner's link first.");

        var list = (text.match(/[?&]list=([^&#]+)/) || [])[1] || 'classic';
        if(text.indexOf('#') >= 0 && list !== $listType.value) {
            throw new Error('That link is for the ' + (Kinklist.LISTS[list] || list)
                    + ' list. Switch to it with the list picker, then compare again.');
        }

        var hash = text.substring(text.indexOf('#') + 1);
        if(!Kinklist.validHash(hash, linkSize)) {
            throw new Error("That link doesn't match this list. You both need to rate the same list.");
        }
        return hash;
    }

    byId('Compare').addEventListener('click', function(){
        byId('CompareError').textContent = '';
        $compare.showModal();
    });
    byId('CompareClose').addEventListener('click', function(){ $compare.close(); });
    byId('CompareForm').addEventListener('submit', function(e){
        e.preventDefault();
        byId('CompareError').textContent = '';
        var theirs;
        try {
            theirs = partnerHash(byId('CompareLink').value);
        }
        catch(err) {
            byId('CompareError').textContent = err.message;
            return;
        }

        var mine = encode(linkValues());
        // An edited list is not in any link, so pass it to the new tab directly
        if(customText) sessionStorage.setItem('kinklist-compare-list', customText);
        var url = 'compare.html?list=' + (customText ? 'custom&base=' + $listType.value : $listType.value) + '#a=' + mine + '&b=' + theirs;
        if(!window.open(url, '_blank')) location.href = url;
        $compare.close();
    });

    /* Start */

    var store = readStore();
    $remember.checked = !!store;

    // A link says which list it is for; otherwise go back to the remembered one
    var requested = new URLSearchParams(location.search).get('list') || (store && !location.hash ? store.list : '');
    if($listType.querySelector('option[value="' + CSS.escape(requested || '') + '"]')) {
        $listType.value = requested;
    }
    loadList($listType.value).catch(function(){
        $listType.value = 'classic';
        return loadList('classic');
    }).then(function(text){
        if(store && store.custom && store.list === $listType.value) {
            try {
                cats = parseKinksText(store.custom);
                customText = store.custom;
            }
            catch(e) {}
        }
        if(!customText) cats = parseKinksText(text);
        render();

        if(location.hash.length > 10) {
            parseHash();
            checkLink();
        }
        else if(store) {
            applyStore(store);
            updateUrl();
        }
    });
})();
