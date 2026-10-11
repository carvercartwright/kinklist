// Shared by the list page and the comparison page
var Kinklist = (function(){
    'use strict';

    var LEVELS = ['Not entered', 'Favorite', 'Like', 'Interested', 'Indifferent', 'Limit / Not interested / N/A'];
    var LISTS = { classic: 'Classic', detailed: 'Detailed', plsno: "Please Don't" };
    var HASH_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.=+*^!@";

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

    // Number of ratings in a list, which is also the length of its flat value array
    function count(cats){
        return cats.reduce(function(sum, cat){ return sum + (cat.kinks.length * cat.fields.length); }, 0);
    }

    /* Link: ratings are packed into the URL hash, category by category, kink by kink, field by field */

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

    // Length of the hash for a list with this many ratings
    function hashLength(numValues){
        return Math.ceil(numValues / inputPow) * outputPow;
    }

    // A link made before items were added is shorter; the missing ratings count as not entered
    function validHash(hash, numValues){
        return hash.length > 0 && hash.length % outputPow === 0 && hash.length <= hashLength(numValues);
    }

    // Where each rating sits in a link. Standard lists have fixed positions (kinklist-order.js) so
    // adding, removing or moving items never changes what an existing link means; anything not
    // listed there, such as items added with Edit list, goes after them in display order.
    function slots(cats, listName){
        var order = (typeof KinklistOrder !== 'undefined' && KinklistOrder[listName]) || [];
        var known = new Map(order.map(function(key, i){ return [key, i]; }));
        var next = order.length;
        var index = [];
        cats.forEach(function(cat){
            cat.kinks.forEach(function(kink){
                cat.fields.forEach(function(field){
                    var key = [cat.name, kink.name, field].join('\n');
                    index.push(known.has(key) ? known.get(key) : next++);
                });
            });
        });
        return { index: index, size: next };
    }

    /* Comparing two people's ratings of the same list */

    // Field pairs where one person's first field lines up with the other's second
    var MIRRORED_FIELDS = [
        'self|partner', 'giving|receiving', 'as dominant|as submissive',
        'as dom|as sub', 'aggressor|target', 'actor|subject', 'being center|participating',
        'on self|on others'
    ];
    // These two read better from one side: "on you" already means "on their partner"
    var SELF_FIELDS = ['self|partner', 'on self|on others'];
    var SECTIONS = [
        { id: 'both', title: 'You both want this' },
        { id: 'talk', title: 'One of you is keen, the other is open' },
        { id: 'open', title: 'Open on both sides' },
        { id: 'limit', title: 'A limit for one of you' },
        { id: 'single', title: 'Rated by only one of you' }
    ];

    function keen(value){ return value === 1 || value === 2; }

    // mine and theirs are value arrays in link order; slot maps each rating, in display order, into them
    function compare(cats, mine, theirs, slot){
        var entries = [];
        var index = 0;

        cats.forEach(function(cat){
            var fields = cat.fields.map(function(field){ return field.toLowerCase(); });
            var mirrored = MIRRORED_FIELDS.indexOf(fields.join('|')) >= 0;
            var selfFields = SELF_FIELDS.indexOf(fields.join('|')) >= 0;

            cat.kinks.forEach(function(kink){
                fields.forEach(function(field, fi){
                    var entry = {
                        cat: cat.name,
                        name: kink.name,
                        role: fields.length > 1 ? field : '',
                        you: mine[slot[index + fi]] || 0,
                        them: theirs[slot[index + (mirrored ? 1 - fi : fi)]] || 0
                    };
                    if(selfFields) entry.role = (fi === 0) ? 'on you' : 'on them';
                    else if(mirrored) entry.role = 'you ' + field + ', they ' + fields[1 - fi];

                    if(!entry.you && !entry.them) return;
                    if(entry.you === 5 || entry.them === 5) {
                        entry.section = 'limit';
                        // The other person wanting it is the conversation that matters most
                        entry.clash = keen(entry.you) || keen(entry.them);
                    }
                    else if(!entry.you || !entry.them) entry.section = 'single';
                    else if(keen(entry.you) && keen(entry.them)) entry.section = 'both';
                    else if(keen(entry.you) || keen(entry.them)) entry.section = 'talk';
                    else entry.section = 'open';
                    entries.push(entry);
                });
                index += fields.length;
            });
        });
        return entries;
    }

    return {
        LEVELS: LEVELS,
        LISTS: LISTS,
        SECTIONS: SECTIONS,
        parseKinksText: parseKinksText,
        count: count,
        encode: encode,
        decode: decode,
        validHash: validHash,
        slots: slots,
        compare: compare
    };
})();
