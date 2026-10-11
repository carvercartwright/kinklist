(function(){
    'use strict';

    var LEVELS = ['Not entered', 'Favorite', 'Like', 'Indifferent', 'Maybe', 'Limit'];
    var HASH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.=+*^!@";
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
    // Every rating control in hash order: { cat, kink, fi, node }
    var groups = [];

    /* Parsing */

    function parseKinksText(text){
        var byName = new Map();
        var cat = null;
        var kink = null;
        var close = function(){
            if(!cat) return;
            if(!cat.fields.length) throw new Error(cat.name + ' does not have any fields defined.');
            if(!cat.kinks.length) throw new Error(cat.name + ' does not have any kinks listed.');
            byName.set(cat.name, cat);
        };

        text.replace(/\r/g, '').split('\n').forEach(function(line){
            line = line.trim();
            if(!line) return;

            var rest = line.substring(1).trim();
            if(line[0] === '#') {
                close();
                cat = rest ? { name: rest, fields: [], kinks: [] } : null;
                kink = null;
            }
            else if(!cat) return;
            else if(line[0] === '(') {
                cat.fields = rest.replace(/\)$/, '').split(',')
                        .map(function(field){ return field.trim(); })
                        .filter(Boolean);
            }
            else if(line[0] === '*') {
                kink = { name: rest, desc: '' };
                cat.kinks.push(kink);
            }
            else if(line[0] === '?' && kink) {
                kink.desc = rest;
            }
        });
        close();

        if(!byName.size) throw new Error('The list needs at least one category.');
        var parsed = Array.from(byName.values());
        parsed.forEach(function(cat){
            cat.kinks.forEach(function(kink){
                kink.values = cat.fields.map(function(){ return 0; });
            });
        });
        return parsed;
    }

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

    function maxPow(base, maxVal){
        var maxPow = 1;
        for(var pow = 1; Math.pow(base, pow) <= maxVal; pow++){
            maxPow = pow;
        }
        return maxPow;
    }
    var hashBase = HASH_CHARS.length;
    var outputPow = maxPow(hashBase, Number.MAX_SAFE_INTEGER);
    var inputPow = maxPow(LEVELS.length, Math.pow(hashBase, outputPow));

    function encode(values){
        var output = "";
        for(var start = 0; start < values.length; start += inputPow) {
            var chunkInt = 0;
            for(var pow = 0; pow < inputPow && start + pow < values.length; pow++) {
                chunkInt += values[start + pow] * Math.pow(LEVELS.length, pow);
            }
            var chunk = "";
            for(var i = 0; i < outputPow; i++) {
                chunk = HASH_CHARS[chunkInt % hashBase] + chunk;
                chunkInt = Math.floor(chunkInt / hashBase);
            }
            output += chunk;
        }
        return output;
    }

    function decode(hash){
        var values = [];
        for(var start = 0; start < hash.length; start += outputPow) {
            var chunk = hash.substring(start, start + outputPow);
            var chunkInt = 0;
            for(var i = 0; i < chunk.length; i++) {
                chunkInt = (chunkInt * hashBase) + Math.max(0, HASH_CHARS.indexOf(chunk[i]));
            }
            for(var pow = 0; pow < inputPow; pow++) {
                values.push(chunkInt % LEVELS.length);
                chunkInt = Math.floor(chunkInt / LEVELS.length);
            }
        }
        return values;
    }

    function updateUrl(){
        var values = groups.map(function(g){ return g.kink.values[g.fi]; });
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
    }

    function parseHash(){
        var hash = location.hash.substring(1);
        if(hash.length < 10) return;

        var values = decode(hash);
        groups.forEach(function(g, i){
            g.kink.values[g.fi] = values[i] || 0;
            paint(g);
        });
        updateTally();
    }

    // Pasting a link into a tab that already has the page open
    window.addEventListener('hashchange', parseHash);

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

        // Legend
        context.font = "bold 13px " + FONT;
        var legendX = width - 15 - (120 * LEVELS.length);
        LEVELS.forEach(function(label, level){
            drawCircle(context, legendX + (120 * level), 17, colors[level]);
            context.fillStyle = '#000000';
            context.fillText(label, legendX + 15 + (level * 120), 22);
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

    /* Compare with a partner's link */

    // Field pairs where one person's first field lines up with the other's second
    var MIRRORED_FIELDS = [
        'self|partner', 'giving|receiving', 'as dominant|as submissive',
        'as dom|as sub', 'aggressor|target', 'actor|subject', 'being center|participating',
        'on self|on others'
    ];
    // These two read better from one side: "on you" already means "on their partner"
    var SELF_FIELDS = ['self|partner', 'on self|on others'];
    var COMPARE_SECTIONS = [
        { id: 'both', title: 'You both want this' },
        { id: 'talk', title: 'One of you is keen, the other is open' },
        { id: 'open', title: 'Open on both sides' },
        { id: 'limit', title: 'A limit for one of you' }
    ];
    var $compare = byId('CompareDialog');
    var comparison = null;

    function parsePartnerLink(text){
        text = text.trim();
        if(!text) throw new Error("Paste your partner's link first.");

        var list = (text.match(/[?&]list=([^&#]+)/) || [])[1] || 'classic';
        if(text.indexOf('#') >= 0 && list !== $listType.value) {
            var $option = $listType.querySelector('option[value="' + CSS.escape(list) + '"]');
            throw new Error('That link is for the ' + ($option ? $option.textContent : list)
                    + ' list. Switch to it with the list picker, then compare again.');
        }

        var hash = text.substring(text.indexOf('#') + 1);
        if(hash.length !== Math.ceil(groups.length / inputPow) * outputPow) {
            throw new Error("That link doesn't match this list. You both need to rate the same list.");
        }
        return decode(hash);
    }

    function compareWith(theirs){
        var result = { sections: {}, unrated: 0 };
        COMPARE_SECTIONS.forEach(function(section){ result.sections[section.id] = []; });

        var add = function(kink, mine, theirGroup, role){
            var entry = { name: kink.name, role: role, you: mine, them: theirs[theirGroup.index] || 0 };
            var keen = function(value){ return value === 1 || value === 2; };
            var open = function(value){ return value === 3 || value === 4; };

            if(!entry.you && !entry.them) return;
            if(entry.you === 5 || entry.them === 5) {
                // The other person wanting it is the conversation that matters most
                entry.clash = keen(entry.you) || keen(entry.them);
                result.sections.limit.push(entry);
            }
            else if(!entry.you || !entry.them) result.unrated++;
            else if(keen(entry.you) && keen(entry.them)) result.sections.both.push(entry);
            else if(keen(entry.you) || keen(entry.them)) result.sections.talk.push(entry);
            else if(open(entry.you) && open(entry.them)) result.sections.open.push(entry);
        };

        cats.forEach(function(cat){
            var fields = cat.fields.map(function(field){ return field.toLowerCase(); });
            var mirrored = MIRRORED_FIELDS.indexOf(fields.join('|')) >= 0;
            var selfFields = SELF_FIELDS.indexOf(fields.join('|')) >= 0;
            cat.kinks.forEach(function(kink){
                kink.groups.forEach(function(group, fi){
                    if(selfFields) {
                        add(kink, kink.values[fi], kink.groups[1 - fi], fi === 0 ? 'on you' : 'on them');
                    }
                    else if(mirrored) {
                        add(kink, kink.values[fi], kink.groups[1 - fi], 'you ' + fields[fi] + ', they ' + fields[1 - fi]);
                    }
                    else {
                        add(kink, kink.values[fi], group, fields.length > 1 ? fields[fi] : '');
                    }
                });
            });
        });

        Object.keys(result.sections).forEach(function(id){
            result.sections[id].sort(function(a, b){
                return (b.clash || 0) - (a.clash || 0) || (a.you + a.them) - (b.you + b.them);
            });
        });
        return result;
    }

    function comparisonToMarkdown(){
        var lines = ['# Kinklist comparison', '', 'List: ' + $listType.selectedOptions[0].textContent];
        COMPARE_SECTIONS.forEach(function(section){
            var entries = comparison.sections[section.id];
            if(!entries.length) return;
            lines.push('', '## ' + section.title + ' (' + entries.length + ')', '');
            entries.forEach(function(entry){
                lines.push('- **' + entry.name + '**' + (entry.role ? ' (' + entry.role + ')' : '')
                        + ': you ' + LEVELS[entry.you] + ', they ' + LEVELS[entry.them]
                        + (entry.clash ? ' (one wants it, one will not)' : ''));
            });
        });
        if(comparison.unrated) {
            lines.push('', comparison.unrated + ' more rated by only one of you.');
        }
        return lines.join('\n') + '\n';
    }

    function renderComparison(){
        var $results = byId('CompareResults');
        $results.textContent = '';

        var rating = function(who, value){
            var $rating = el('span', 'rating');
            var $swatch = el('span', 'swatch');
            $swatch.dataset.level = value;
            $rating.append($swatch, who + ' ' + LEVELS[value].toLowerCase());
            return $rating;
        };

        var total = 0;
        COMPARE_SECTIONS.forEach(function(section){
            var entries = comparison.sections[section.id];
            if(!entries.length) return;
            total += entries.length;

            $results.append(el('h3', '', section.title + ' (' + entries.length + ')'));
            var $ul = el('ul', 'compare-list');
            entries.forEach(function(entry){
                var $li = el('li', entry.clash ? 'clash' : '');
                var $what = el('span', 'compare-name', entry.name);
                if(entry.role) $what.append(el('small', '', entry.role));
                $li.append($what, rating('You', entry.you), rating('They', entry.them));
                $ul.append($li);
            });
            $results.append($ul);
        });

        if(!total) {
            $results.append(el('p', '', 'Nothing to compare yet. Rate some items on both lists first.'));
        }
        if(comparison.unrated) {
            $results.append(el('p', '', comparison.unrated + ' more rated by only one of you.'));
        }
        byId('CompareExport').hidden = !total;
    }

    byId('Compare').addEventListener('click', function(){
        byId('CompareError').textContent = '';
        $compare.showModal();
    });
    byId('CompareClose').addEventListener('click', function(){ $compare.close(); });
    byId('CompareForm').addEventListener('submit', function(e){
        e.preventDefault();
        byId('CompareError').textContent = '';
        try {
            comparison = compareWith(parsePartnerLink(byId('CompareLink').value));
        }
        catch(err) {
            byId('CompareError').textContent = err.message;
            return;
        }
        renderComparison();
    });
    byId('CompareCopy').addEventListener('click', function(){
        var $btn = this;
        var markdown = comparisonToMarkdown();
        var done = function(){
            $btn.textContent = 'Copied';
            setTimeout(function(){ $btn.textContent = 'Copy as Markdown'; }, 2000);
        };
        if(navigator.clipboard) navigator.clipboard.writeText(markdown).then(done, function(){ downloadText(markdown); });
        else downloadText(markdown);
    });
    byId('CompareSave').addEventListener('click', function(){ downloadText(comparisonToMarkdown()); });

    function downloadText(text){
        var url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
        var $link = el('a');
        $link.href = url;
        $link.download = 'kinklist-comparison.md';
        document.body.append($link);
        $link.click();
        $link.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    }

    /* Start */

    var requested = new URLSearchParams(location.search).get('list');
    if($listType.querySelector('option[value="' + CSS.escape(requested || '') + '"]')) {
        $listType.value = requested;
    }
    loadList($listType.value).catch(function(){
        $listType.value = 'classic';
        return loadList('classic');
    }).then(function(text){
        cats = parseKinksText(text);
        render();
        parseHash();
    });
})();
