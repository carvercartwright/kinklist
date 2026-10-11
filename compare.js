(function(){
    'use strict';

    var LEVELS = Kinklist.LEVELS;
    var byId = function(id){ return document.getElementById(id); };
    var el = function(tag, className, text){
        var node = document.createElement(tag);
        if(className) node.className = className;
        if(text) node.textContent = text;
        return node;
    };

    var listName = new URLSearchParams(location.search).get('list') || 'classic';
    var cats = [];
    // Flat rating arrays for each side, read from #a=...&b=...
    var sides = { a: [], b: [] };
    var entries = [];
    var filter = 'both';

    function fail(message){
        byId('Problem').textContent = message;
        byId('Problem').hidden = false;
        byId('Comparison').hidden = true;
    }

    function readHash(){
        var hashes = {};
        location.hash.substring(1).split('&').forEach(function(part){
            hashes[part[0]] = part.substring(2);
        });
        var expected = Kinklist.hashLength(Kinklist.count(cats));
        if(!hashes.a || !hashes.b || hashes.a.length !== expected || hashes.b.length !== expected) {
            throw new Error("This comparison link is incomplete or was made for a different list. Go back to your list and use Compare again.");
        }
        return hashes;
    }

    function loadList(){
        if(listName === 'custom') {
            var text = sessionStorage.getItem('kinklist-compare-list');
            if(!text) return Promise.reject(new Error('This comparison used an edited list, which is only available in the tab that opened it. Go back to your list and use Compare again.'));
            return Promise.resolve(text);
        }
        if(!Kinklist.LISTS[listName]) return Promise.reject(new Error('This comparison link names a list that does not exist.'));
        return fetch(listName + '.txt').then(function(response){
            if(!response.ok) throw new Error('The list could not be loaded. Check your connection and reload.');
            return response.text();
        });
    }

    function rating(value){
        var $rating = el('span', 'rating');
        var $swatch = el('span', 'swatch');
        $swatch.dataset.level = value;
        $rating.append($swatch, LEVELS[value]);
        return $rating;
    }

    function shown(){
        return entries.filter(function(entry){ return filter === 'all' || entry.section === filter; });
    }

    function render(){
        entries = Kinklist.compare(cats, sides.a, sides.b);

        // Tabs, one per kind of match, each with its count
        var $tabs = byId('Tabs');
        $tabs.textContent = '';
        Kinklist.SECTIONS.concat([{ id: 'all', title: 'Everything rated' }]).forEach(function(section){
            var count = entries.filter(function(entry){ return section.id === 'all' || entry.section === section.id; }).length;
            var $tab = el('button', 'tab', section.title);
            $tab.type = 'button';
            $tab.append(el('span', 'tab-count', String(count)));
            $tab.setAttribute('aria-pressed', filter === section.id);
            $tab.addEventListener('click', function(){
                filter = section.id;
                render();
            });
            $tabs.append($tab);
        });

        var $results = byId('Results');
        $results.textContent = '';
        var visible = shown();
        if(!visible.length) {
            $results.append(el('p', 'empty', entries.length
                    ? 'Nothing in this group. Try another one above.'
                    : 'Neither list has any ratings yet. Rate some items, then compare again.'));
            return;
        }

        // Keep the list's own order: a box per category, a row per item
        var $cat = null;
        var catName = null;
        visible.forEach(function(entry){
            if(entry.cat !== catName) {
                catName = entry.cat;
                $cat = el('section', 'category');
                $cat.append(el('h2', '', catName));
                var $head = el('div', 'pair-head');
                $head.append(el('span'), el('span', '', 'You'), el('span', '', 'Partner'));
                $cat.append($head);
                $results.append($cat);
            }
            var $row = el('div', 'pair' + (entry.clash ? ' clash' : ''));
            var $name = el('div', 'pair-name', entry.name);
            if(entry.role) $name.append(el('small', '', entry.role));
            if(entry.clash) $name.append(el('small', 'clash-note', 'One wants it, one will not'));
            var $you = rating(entry.you);
            var $them = rating(entry.them);
            $you.dataset.who = 'You';
            $them.dataset.who = 'Partner';
            $row.append($name, $you, $them);
            $cat.append($row);
        });
    }

    function toMarkdown(){
        var lines = ['# Kinklist comparison', '', 'List: ' + (Kinklist.LISTS[listName] || 'Edited list')];
        Kinklist.SECTIONS.forEach(function(section){
            var inSection = entries.filter(function(entry){ return entry.section === section.id; });
            if(!inSection.length) return;
            lines.push('', '## ' + section.title + ' (' + inSection.length + ')', '');
            inSection.forEach(function(entry){
                lines.push('- **' + entry.name + '**' + (entry.role ? ' (' + entry.role + ')' : '')
                        + ': you ' + LEVELS[entry.you] + ', partner ' + LEVELS[entry.them]
                        + (entry.clash ? ' (one wants it, one will not)' : ''));
            });
        });
        return lines.join('\n') + '\n';
    }

    function flash($btn, text){
        var original = $btn.textContent;
        $btn.textContent = text;
        setTimeout(function(){ $btn.textContent = original; }, 2000);
    }

    function copy($btn, text, doneText){
        if(navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function(){ flash($btn, doneText); }, function(){
                prompt('Copy this', text);
            });
        }
        else {
            prompt('Copy this', text);
        }
    }

    byId('Swap').addEventListener('click', function(){
        var hashes = readHash();
        history.replaceState(null, '', location.pathname + location.search + '#a=' + hashes.b + '&b=' + hashes.a);
        sides = { a: sides.b, b: sides.a };
        render();
    });
    byId('CopyLink').addEventListener('click', function(){ copy(this, location.href, 'Link copied'); });
    byId('CopyMarkdown').addEventListener('click', function(){ copy(this, toMarkdown(), 'Copied'); });
    byId('SaveMarkdown').addEventListener('click', function(){
        var url = URL.createObjectURL(new Blob([toMarkdown()], { type: 'text/markdown' }));
        var $link = el('a');
        $link.href = url;
        $link.download = 'kinklist-comparison.md';
        document.body.append($link);
        $link.click();
        $link.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    });

    loadList().then(function(text){
        cats = Kinklist.parseKinksText(text);
        var hashes = readHash();
        sides = { a: Kinklist.decode(hashes.a), b: Kinklist.decode(hashes.b) };

        byId('ListName').textContent = (Kinklist.LISTS[listName] || 'Edited') + ' list';
        byId('BackLink').href = 'index.html' + (Kinklist.LISTS[listName] && listName !== 'classic' ? '?list=' + listName : '') + '#' + hashes.a;
        // Start on the first group that has anything in it
        var all = Kinklist.compare(cats, sides.a, sides.b);
        var first = Kinklist.SECTIONS.find(function(section){
            return all.some(function(entry){ return entry.section === section.id; });
        });
        if(first) filter = first.id;
        render();
    }).catch(function(e){
        fail(e.message);
    });
})();
