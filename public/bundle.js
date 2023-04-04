var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src/App.svelte generated by Svelte v3.52.0 */

    const { document: document_1 } = globals;

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[39] = list[i];
    	child_ctx[40] = list;
    	child_ctx[41] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[42] = list[i];
    	child_ctx[41] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[44] = list[i];
    	child_ctx[41] = i;
    	return child_ctx;
    }

    // (111:1) {#each Object.keys(data) as lng, i (`lang-${i}
    function create_each_block_2(key_1, ctx) {
    	let button;
    	let t_value = (/*lng*/ ctx[44] == 'th' ? 'ไทย' : 'Eng') + "";
    	let t;
    	let button_class_value;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[8](/*lng*/ ctx[44]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			button = element("button");
    			t = text(t_value);

    			attr(button, "class", button_class_value = "p-3 shadow-md " + (/*q*/ ctx[1].lang === /*lng*/ ctx[44]
    			? "bg-gray-900 text-white"
    			: "text-gray-900 bg-gray-50 hover:bg-gray-900 focus:bg-gray-900 hover:text-white focus:text-white"));

    			this.first = button;
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*data*/ 1 && t_value !== (t_value = (/*lng*/ ctx[44] == 'th' ? 'ไทย' : 'Eng') + "")) set_data(t, t_value);

    			if (dirty[0] & /*q, data*/ 3 && button_class_value !== (button_class_value = "p-3 shadow-md " + (/*q*/ ctx[1].lang === /*lng*/ ctx[44]
    			? "bg-gray-900 text-white"
    			: "text-gray-900 bg-gray-50 hover:bg-gray-900 focus:bg-gray-900 hover:text-white focus:text-white"))) {
    				attr(button, "class", button_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (118:1) {#each Object.keys(data[q.lang].label) as dc, i (`doc-${i}
    function create_each_block_1(key_1, ctx) {
    	let button;
    	let t0_value = /*data*/ ctx[0][/*q*/ ctx[1].lang].label[/*dc*/ ctx[42]].title + "";
    	let t0;
    	let t1;
    	let button_class_value;
    	let mounted;
    	let dispose;

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[9](/*dc*/ ctx[42]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();

    			attr(button, "class", button_class_value = "p-3 shadow-md " + (/*q*/ ctx[1].doc === /*dc*/ ctx[42]
    			? "bg-gray-900 text-white"
    			: "text-gray-900 bg-gray-50 hover:bg-gray-900 focus:bg-gray-900 hover:text-white focus:text-white"));

    			this.first = button;
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t0);
    			append(button, t1);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*data, q*/ 3 && t0_value !== (t0_value = /*data*/ ctx[0][/*q*/ ctx[1].lang].label[/*dc*/ ctx[42]].title + "")) set_data(t0, t0_value);

    			if (dirty[0] & /*q, data*/ 3 && button_class_value !== (button_class_value = "p-3 shadow-md " + (/*q*/ ctx[1].doc === /*dc*/ ctx[42]
    			? "bg-gray-900 text-white"
    			: "text-gray-900 bg-gray-50 hover:bg-gray-900 focus:bg-gray-900 hover:text-white focus:text-white"))) {
    				attr(button, "class", button_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (151:3) {#if q.doc !== 'receipt'}
    function create_if_block_1(ctx) {
    	let span;
    	let t0_value = /*l*/ ctx[2].duedate + "";
    	let t0;
    	let t1;
    	let p;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			span = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			p = element("p");
    			attr(span, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(p, "class", "pl-3 mt-2 mb-4");
    			attr(p, "contenteditable", "true");
    			if (/*q*/ ctx[1].duedate === void 0) add_render_callback(() => /*p_input_handler*/ ctx[18].call(p));
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t0);
    			insert(target, t1, anchor);
    			insert(target, p, anchor);

    			if (/*q*/ ctx[1].duedate !== void 0) {
    				p.textContent = /*q*/ ctx[1].duedate;
    			}

    			if (!mounted) {
    				dispose = listen(p, "input", /*p_input_handler*/ ctx[18]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*l*/ 4 && t0_value !== (t0_value = /*l*/ ctx[2].duedate + "")) set_data(t0, t0_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].duedate !== p.textContent) {
    				p.textContent = /*q*/ ctx[1].duedate;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			if (detaching) detach(t1);
    			if (detaching) detach(p);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (193:3) {#each q.itemDesc as _, i (`item-${i}
    function create_each_block(key_1, ctx) {
    	let tr;
    	let td0;
    	let t0_value = /*i*/ ctx[41] + 1 + "";
    	let t0;
    	let t1;
    	let td1;
    	let t2;
    	let td2;
    	let t3_value = /*price*/ ctx[3](/*q*/ ctx[1].itemPrice[/*i*/ ctx[41]]) + "";
    	let t3;
    	let t4;
    	let td3;
    	let t5_value = /*qty*/ ctx[4](/*q*/ ctx[1].itemQty[/*i*/ ctx[41]]) + "";
    	let t5;
    	let t6;
    	let td4;
    	let t7_value = /*price*/ ctx[3](/*q*/ ctx[1].itemAmount[/*i*/ ctx[41]]) + "";
    	let t7;
    	let t8;
    	let mounted;
    	let dispose;

    	function td1_input_handler() {
    		/*td1_input_handler*/ ctx[20].call(td1, /*i*/ ctx[41]);
    	}

    	function focus_handler(...args) {
    		return /*focus_handler*/ ctx[21](/*i*/ ctx[41], ...args);
    	}

    	function input_handler(...args) {
    		return /*input_handler*/ ctx[22](/*i*/ ctx[41], ...args);
    	}

    	function blur_handler(...args) {
    		return /*blur_handler*/ ctx[23](/*i*/ ctx[41], ...args);
    	}

    	function focus_handler_1(...args) {
    		return /*focus_handler_1*/ ctx[24](/*i*/ ctx[41], ...args);
    	}

    	function input_handler_1(...args) {
    		return /*input_handler_1*/ ctx[25](/*i*/ ctx[41], ...args);
    	}

    	function blur_handler_1(...args) {
    		return /*blur_handler_1*/ ctx[26](/*i*/ ctx[41], ...args);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = text(t0_value);
    			t1 = space();
    			td1 = element("td");
    			t2 = space();
    			td2 = element("td");
    			t3 = text(t3_value);
    			t4 = space();
    			td3 = element("td");
    			t5 = text(t5_value);
    			t6 = space();
    			td4 = element("td");
    			t7 = text(t7_value);
    			t8 = space();
    			attr(td0, "class", "p-1 text-center whitespace-nowrap");
    			attr(td0, "contenteditable", "true");
    			attr(td1, "class", "p-1");
    			attr(td1, "contenteditable", "true");
    			if (/*q*/ ctx[1].itemDesc[/*i*/ ctx[41]] === void 0) add_render_callback(td1_input_handler);
    			attr(td2, "class", "p-1 text-right whitespace-nowrap");
    			attr(td2, "contenteditable", "true");
    			attr(td3, "class", "p-1 text-right whitespace-nowrap");
    			attr(td3, "contenteditable", "true");
    			attr(td4, "class", "p-1 text-right whitespace-nowrap");
    			attr(tr, "class", "odd:bg-gray-50");
    			this.first = tr;
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, t0);
    			append(tr, t1);
    			append(tr, td1);

    			if (/*q*/ ctx[1].itemDesc[/*i*/ ctx[41]] !== void 0) {
    				td1.textContent = /*q*/ ctx[1].itemDesc[/*i*/ ctx[41]];
    			}

    			append(tr, t2);
    			append(tr, td2);
    			append(td2, t3);
    			append(tr, t4);
    			append(tr, td3);
    			append(td3, t5);
    			append(tr, t6);
    			append(tr, td4);
    			append(td4, t7);
    			append(tr, t8);

    			if (!mounted) {
    				dispose = [
    					listen(td1, "input", td1_input_handler),
    					listen(td2, "focus", focus_handler),
    					listen(td2, "input", input_handler),
    					listen(td2, "blur", blur_handler),
    					listen(td3, "focus", focus_handler_1),
    					listen(td3, "input", input_handler_1),
    					listen(td3, "blur", blur_handler_1)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*q*/ 2 && t0_value !== (t0_value = /*i*/ ctx[41] + 1 + "")) set_data(t0, t0_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].itemDesc[/*i*/ ctx[41]] !== td1.textContent) {
    				td1.textContent = /*q*/ ctx[1].itemDesc[/*i*/ ctx[41]];
    			}

    			if (dirty[0] & /*q*/ 2 && t3_value !== (t3_value = /*price*/ ctx[3](/*q*/ ctx[1].itemPrice[/*i*/ ctx[41]]) + "")) set_data(t3, t3_value);
    			if (dirty[0] & /*q*/ 2 && t5_value !== (t5_value = /*qty*/ ctx[4](/*q*/ ctx[1].itemQty[/*i*/ ctx[41]]) + "")) set_data(t5, t5_value);
    			if (dirty[0] & /*q*/ 2 && t7_value !== (t7_value = /*price*/ ctx[3](/*q*/ ctx[1].itemAmount[/*i*/ ctx[41]]) + "")) set_data(t7, t7_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (246:3) {#if q.doc === 'receipt'}
    function create_if_block(ctx) {
    	let tr;
    	let td0;
    	let span0;
    	let t0_value = /*l*/ ctx[2].totalWht + "";
    	let t0;
    	let t1;
    	let span1;
    	let t2;
    	let span3;
    	let span2;
    	let t3_value = /*rate*/ ctx[5](/*q*/ ctx[1].whtRate) + "";
    	let t3;
    	let t4;
    	let td1;
    	let t5_value = /*price*/ ctx[3](/*q*/ ctx[1].totalWht) + "";
    	let t5;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			span1 = element("span");
    			t2 = space();
    			span3 = element("span");
    			span2 = element("span");
    			t3 = text(t3_value);
    			t4 = space();
    			td1 = element("td");
    			t5 = text(t5_value);
    			attr(span0, "class", "inline-block");
    			attr(span1, "class", "");
    			attr(span2, "class", "");
    			attr(span2, "contenteditable", "true");
    			attr(span3, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(td0, "class", "p-1 whitespace-nowrap");
    			attr(td0, "colspan", "2");
    			attr(td1, "class", "p-1 whitespace-nowrap");
    			attr(tr, "class", "");
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);
    			append(td0, span0);
    			append(span0, t0);
    			append(td0, t1);
    			append(td0, span1);
    			append(td0, t2);
    			append(td0, span3);
    			append(span3, span2);
    			append(span2, t3);
    			append(tr, t4);
    			append(tr, td1);
    			append(td1, t5);

    			if (!mounted) {
    				dispose = [
    					listen(span2, "focus", /*focus_handler_3*/ ctx[31]),
    					listen(span2, "input", /*input_handler_3*/ ctx[32]),
    					listen(span2, "blur", /*blur_handler_3*/ ctx[33])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*l*/ 4 && t0_value !== (t0_value = /*l*/ ctx[2].totalWht + "")) set_data(t0, t0_value);
    			if (dirty[0] & /*q*/ 2 && t3_value !== (t3_value = /*rate*/ ctx[5](/*q*/ ctx[1].whtRate) + "")) set_data(t3, t3_value);
    			if (dirty[0] & /*q*/ 2 && t5_value !== (t5_value = /*price*/ ctx[3](/*q*/ ctx[1].totalWht) + "")) set_data(t5, t5_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let link;
    	let link_href_value;
    	let t0;
    	let div0;
    	let each_blocks_2 = [];
    	let each0_lookup = new Map();
    	let t1;
    	let each_blocks_1 = [];
    	let each1_lookup = new Map();
    	let t2;
    	let div12;
    	let div3;
    	let div1;
    	let img;
    	let img_src_value;
    	let t3;
    	let div2;
    	let h20;
    	let t4;
    	let p0;
    	let t5;
    	let p1;
    	let t6;
    	let div7;
    	let div4;
    	let h1;
    	let t7_value = /*l*/ ctx[2].title + "";
    	let t7;
    	let t8;
    	let p2;
    	let span0;
    	let t9;
    	let span1;
    	let t10;
    	let span2;
    	let t11_value = /*l*/ ctx[2].client + "";
    	let t11;
    	let t12;
    	let h21;
    	let t13;
    	let p3;
    	let t14;
    	let p4;
    	let t15;
    	let div6;
    	let t16;
    	let span3;
    	let t17_value = /*l*/ ctx[2].paymethod + "";
    	let t17;
    	let t18;
    	let p5;
    	let t19;
    	let div5;
    	let h22;
    	let t20_value = /*price*/ ctx[3](/*q*/ ctx[1].totalFinal) + "";
    	let t20;
    	let t21;
    	let p6;
    	let t22_value = /*l*/ ctx[2].totalFinal + "";
    	let t22;
    	let t23;
    	let table;
    	let thead;
    	let tr0;
    	let td0;
    	let t24_value = /*l*/ ctx[2].itemNo + "";
    	let t24;
    	let t25;
    	let td1;
    	let div8;
    	let p7;
    	let t26_value = /*l*/ ctx[2].itemDesc + "";
    	let t26;
    	let t27;
    	let button0;
    	let t28;
    	let button1;
    	let t29;
    	let td2;
    	let t30_value = /*l*/ ctx[2].itemPrice + "";
    	let t30;
    	let t31;
    	let td3;
    	let t32_value = /*l*/ ctx[2].itemQty + "";
    	let t32;
    	let t33;
    	let td4;
    	let t34_value = /*l*/ ctx[2].itemAmount + "";
    	let t34;
    	let t35;
    	let tbody;
    	let each_blocks = [];
    	let each2_lookup = new Map();
    	let t36;
    	let tfoot;
    	let tr1;
    	let td5;
    	let span4;
    	let t37_value = /*l*/ ctx[2].note + "";
    	let t37;
    	let t38;
    	let p8;
    	let td5_rowspan_value;
    	let t39;
    	let td6;
    	let t40_value = /*l*/ ctx[2].totalAmount + "";
    	let t40;
    	let t41;
    	let td7;
    	let t42_value = /*price*/ ctx[3](/*q*/ ctx[1].totalAmount) + "";
    	let t42;
    	let t43;
    	let tr2;
    	let td8;
    	let span5;
    	let t44_value = /*l*/ ctx[2].totalVat + "";
    	let t44;
    	let t45;
    	let span6;
    	let t46;
    	let span8;
    	let span7;
    	let t47_value = /*rate*/ ctx[5](/*q*/ ctx[1].vatRate) + "";
    	let t47;
    	let t48;
    	let td9;
    	let t49_value = /*price*/ ctx[3](/*q*/ ctx[1].totalVat) + "";
    	let t49;
    	let t50;
    	let t51;
    	let tr3;
    	let td10;
    	let t52_value = /*l*/ ctx[2].totalAdjust + "";
    	let t52;
    	let t53;
    	let td11;
    	let t54_value = /*price*/ ctx[3](/*q*/ ctx[1].totalAdjust) + "";
    	let t54;
    	let t55;
    	let div11;
    	let div9;
    	let h30;
    	let t56_value = /*l*/ ctx[2].vendorSign + "";
    	let t56;
    	let t57;
    	let p9;
    	let t58;
    	let p10;
    	let t59;
    	let div10;
    	let h31;
    	let t60_value = /*l*/ ctx[2].clientSign + "";
    	let t60;
    	let t61;
    	let p11;
    	let t62;
    	let p12;
    	let t63;
    	let div13;
    	let button2;
    	let mounted;
    	let dispose;
    	let each_value_2 = Object.keys(/*data*/ ctx[0]);
    	const get_key = ctx => `lang-${/*i*/ ctx[41]}`;

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		let child_ctx = get_each_context_2(ctx, each_value_2, i);
    		let key = get_key(child_ctx);
    		each0_lookup.set(key, each_blocks_2[i] = create_each_block_2(key, child_ctx));
    	}

    	let each_value_1 = Object.keys(/*data*/ ctx[0][/*q*/ ctx[1].lang].label);
    	const get_key_1 = ctx => `doc-${/*i*/ ctx[41]}`;

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1(ctx, each_value_1, i);
    		let key = get_key_1(child_ctx);
    		each1_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
    	}

    	let if_block0 = /*q*/ ctx[1].doc !== 'receipt' && create_if_block_1(ctx);
    	let each_value = /*q*/ ctx[1].itemDesc;
    	const get_key_2 = ctx => `item-${/*i*/ ctx[41]}`;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key_2(child_ctx);
    		each2_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	let if_block1 = /*q*/ ctx[1].doc === 'receipt' && create_if_block(ctx);

    	return {
    		c() {
    			link = element("link");
    			t0 = space();
    			div0 = element("div");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t1 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t2 = space();
    			div12 = element("div");
    			div3 = element("div");
    			div1 = element("div");
    			img = element("img");
    			t3 = space();
    			div2 = element("div");
    			h20 = element("h2");
    			t4 = space();
    			p0 = element("p");
    			t5 = space();
    			p1 = element("p");
    			t6 = space();
    			div7 = element("div");
    			div4 = element("div");
    			h1 = element("h1");
    			t7 = text(t7_value);
    			t8 = space();
    			p2 = element("p");
    			span0 = element("span");
    			t9 = space();
    			span1 = element("span");
    			t10 = space();
    			span2 = element("span");
    			t11 = text(t11_value);
    			t12 = space();
    			h21 = element("h2");
    			t13 = space();
    			p3 = element("p");
    			t14 = space();
    			p4 = element("p");
    			t15 = space();
    			div6 = element("div");
    			if (if_block0) if_block0.c();
    			t16 = space();
    			span3 = element("span");
    			t17 = text(t17_value);
    			t18 = space();
    			p5 = element("p");
    			t19 = space();
    			div5 = element("div");
    			h22 = element("h2");
    			t20 = text(t20_value);
    			t21 = space();
    			p6 = element("p");
    			t22 = text(t22_value);
    			t23 = space();
    			table = element("table");
    			thead = element("thead");
    			tr0 = element("tr");
    			td0 = element("td");
    			t24 = text(t24_value);
    			t25 = space();
    			td1 = element("td");
    			div8 = element("div");
    			p7 = element("p");
    			t26 = text(t26_value);
    			t27 = space();
    			button0 = element("button");
    			button0.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"></path><path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"></path></svg>`;
    			t28 = space();
    			button1 = element("button");
    			button1.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
    			t29 = space();
    			td2 = element("td");
    			t30 = text(t30_value);
    			t31 = space();
    			td3 = element("td");
    			t32 = text(t32_value);
    			t33 = space();
    			td4 = element("td");
    			t34 = text(t34_value);
    			t35 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t36 = space();
    			tfoot = element("tfoot");
    			tr1 = element("tr");
    			td5 = element("td");
    			span4 = element("span");
    			t37 = text(t37_value);
    			t38 = space();
    			p8 = element("p");
    			t39 = space();
    			td6 = element("td");
    			t40 = text(t40_value);
    			t41 = space();
    			td7 = element("td");
    			t42 = text(t42_value);
    			t43 = space();
    			tr2 = element("tr");
    			td8 = element("td");
    			span5 = element("span");
    			t44 = text(t44_value);
    			t45 = space();
    			span6 = element("span");
    			t46 = space();
    			span8 = element("span");
    			span7 = element("span");
    			t47 = text(t47_value);
    			t48 = space();
    			td9 = element("td");
    			t49 = text(t49_value);
    			t50 = space();
    			if (if_block1) if_block1.c();
    			t51 = space();
    			tr3 = element("tr");
    			td10 = element("td");
    			t52 = text(t52_value);
    			t53 = space();
    			td11 = element("td");
    			t54 = text(t54_value);
    			t55 = space();
    			div11 = element("div");
    			div9 = element("div");
    			h30 = element("h3");
    			t56 = text(t56_value);
    			t57 = space();
    			p9 = element("p");
    			t58 = space();
    			p10 = element("p");
    			t59 = space();
    			div10 = element("div");
    			h31 = element("h3");
    			t60 = text(t60_value);
    			t61 = space();
    			p11 = element("p");
    			t62 = space();
    			p12 = element("p");
    			t63 = space();
    			div13 = element("div");
    			button2 = element("button");
    			button2.textContent = "Print";
    			attr(link, "href", link_href_value = /*data*/ ctx[0][/*q*/ ctx[1].lang]['font-link']);
    			attr(link, "rel", "stylesheet");
    			attr(div0, "class", "flex flex-wrap justify-center items-center my-4 print:hidden");
    			attr(img, "class", "");
    			if (!src_url_equal(img.src, img_src_value = /*q*/ ctx[1].vendorLogo)) attr(img, "src", img_src_value);
    			attr(img, "alt", "");
    			attr(img, "width", "");
    			attr(img, "height", "");
    			attr(div1, "class", "pr-4");
    			attr(h20, "class", "border-b text-xl");
    			attr(h20, "contenteditable", "true");
    			if (/*q*/ ctx[1].vendorName === void 0) add_render_callback(() => /*h20_input_handler*/ ctx[10].call(h20));
    			attr(p0, "class", "");
    			attr(p0, "contenteditable", "true");
    			if (/*q*/ ctx[1].vendorId === void 0) add_render_callback(() => /*p0_input_handler*/ ctx[11].call(p0));
    			attr(p1, "class", "");
    			attr(p1, "contenteditable", "true");
    			if (/*q*/ ctx[1].vendorAddress === void 0) add_render_callback(() => /*p1_input_handler*/ ctx[12].call(p1));
    			attr(div2, "class", "flex-1 text-right");
    			attr(div3, "class", "bg-gray-50 flex p-4 shadow-md");
    			attr(h1, "class", "text-3xl");
    			attr(span0, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(span0, "contenteditable", "true");
    			if (/*q*/ ctx[1].ref === void 0) add_render_callback(() => /*span0_input_handler*/ ctx[13].call(span0));
    			attr(span1, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(span1, "contenteditable", "true");
    			if (/*q*/ ctx[1].date === void 0) add_render_callback(() => /*span1_input_handler*/ ctx[14].call(span1));
    			attr(p2, "class", "mt-2 mb-4");
    			attr(span2, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(h21, "class", "text-xl pl-3 mt-2");
    			attr(h21, "contenteditable", "true");
    			if (/*q*/ ctx[1].clientName === void 0) add_render_callback(() => /*h21_input_handler*/ ctx[15].call(h21));
    			attr(p3, "class", "pl-3");
    			attr(p3, "contenteditable", "true");
    			if (/*q*/ ctx[1].clientId === void 0) add_render_callback(() => /*p3_input_handler*/ ctx[16].call(p3));
    			attr(p4, "class", "pl-3");
    			attr(p4, "contenteditable", "true");
    			if (/*q*/ ctx[1].clientAddress === void 0) add_render_callback(() => /*p4_input_handler*/ ctx[17].call(p4));
    			attr(div4, "class", "");
    			attr(span3, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(p5, "class", "pl-3 mt-2 mb-4");
    			attr(p5, "contenteditable", "true");
    			if (/*q*/ ctx[1].paymethod === void 0) add_render_callback(() => /*p5_input_handler*/ ctx[19].call(p5));
    			attr(h22, "class", "border-b border-gray-700 text-2xl");
    			attr(p6, "class", "");
    			attr(div5, "class", "bg-gray-900 text-white text-right p-4 shadow-md");
    			attr(div6, "class", "");
    			attr(div7, "class", "grid grid-cols-2 my-4");
    			attr(td0, "class", "p-1 w-px whitespace-nowrap");
    			attr(p7, "class", "p-1 flex-grow");
    			attr(button0, "class", "p-1.5 print:hidden");
    			attr(button1, "class", "p-1.5 print:hidden");
    			attr(div8, "class", "flex");
    			attr(td1, "class", "");
    			attr(td2, "class", "p-1 w-px whitespace-nowrap");
    			attr(td3, "class", "p-1 w-px whitespace-nowrap");
    			attr(td4, "class", "p-1 w-px whitespace-nowrap");
    			attr(tr0, "class", "border-b");
    			attr(thead, "class", "");
    			attr(tbody, "class", "divide-y");
    			attr(span4, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(p8, "class", "pl-3 mt-2 mb-4");
    			attr(p8, "contenteditable", "true");
    			if (/*q*/ ctx[1].note === void 0) add_render_callback(() => /*p8_input_handler*/ ctx[27].call(p8));
    			attr(td5, "class", "text-left p-1");
    			attr(td5, "colspan", "2");
    			attr(td5, "rowspan", td5_rowspan_value = /*q*/ ctx[1].doc === 'receipt' ? 4 : 3);
    			attr(td6, "class", "p-1 whitespace-nowrap");
    			attr(td6, "colspan", "2");
    			attr(td7, "class", "p-1 whitespace-nowrap");
    			attr(tr1, "class", "");
    			attr(span5, "class", "inline-block");
    			attr(span6, "class", "");
    			attr(span7, "class", "");
    			attr(span7, "contenteditable", "true");
    			attr(span8, "class", "inline-block rounded-3xl bg-gray-900 text-white py-0.5 px-2 text-sm");
    			attr(td8, "class", "p-1 whitespace-nowrap");
    			attr(td8, "colspan", "2");
    			attr(td9, "class", "p-1 whitespace-nowrap");
    			attr(tr2, "class", "");
    			attr(td10, "class", "p-1 whitespace-nowrap");
    			attr(td10, "colspan", "2");
    			attr(td11, "class", "p-1 whitespace-nowrap");
    			attr(td11, "contenteditable", "true");
    			attr(tr3, "class", "");
    			attr(tfoot, "class", "text-right");
    			attr(table, "class", "w-full mb-4");
    			attr(h30, "class", "");
    			attr(p9, "class", "border-b");
    			attr(p9, "contenteditable", "true");
    			attr(p10, "class", "");
    			attr(p10, "contenteditable", "true");
    			attr(div9, "class", "bg-gray-50 p-4 shadow-md");
    			attr(h31, "class", "");
    			attr(p11, "class", "border-b");
    			attr(p11, "contenteditable", "true");
    			attr(p12, "class", "");
    			attr(p12, "contenteditable", "true");
    			attr(div10, "class", "bg-gray-50 p-4 shadow-md");
    			attr(div11, "class", "grid grid-cols-2 gap-4");
    			attr(div12, "class", "bg-white text-gray-900 px-3 max-w-[60rem] mx-auto print:max-w-none print:mx-0");
    			attr(button2, "class", "p-3 shadow-md text-white bg-gray-900");
    			attr(div13, "class", "flex flex-wrap justify-center items-center my-4 print:hidden");
    		},
    		m(target, anchor) {
    			append(document_1.head, link);
    			insert(target, t0, anchor);
    			insert(target, div0, anchor);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(div0, null);
    			}

    			append(div0, t1);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			insert(target, t2, anchor);
    			insert(target, div12, anchor);
    			append(div12, div3);
    			append(div3, div1);
    			append(div1, img);
    			append(div3, t3);
    			append(div3, div2);
    			append(div2, h20);

    			if (/*q*/ ctx[1].vendorName !== void 0) {
    				h20.textContent = /*q*/ ctx[1].vendorName;
    			}

    			append(div2, t4);
    			append(div2, p0);

    			if (/*q*/ ctx[1].vendorId !== void 0) {
    				p0.textContent = /*q*/ ctx[1].vendorId;
    			}

    			append(div2, t5);
    			append(div2, p1);

    			if (/*q*/ ctx[1].vendorAddress !== void 0) {
    				p1.textContent = /*q*/ ctx[1].vendorAddress;
    			}

    			append(div12, t6);
    			append(div12, div7);
    			append(div7, div4);
    			append(div4, h1);
    			append(h1, t7);
    			append(div4, t8);
    			append(div4, p2);
    			append(p2, span0);

    			if (/*q*/ ctx[1].ref !== void 0) {
    				span0.textContent = /*q*/ ctx[1].ref;
    			}

    			append(p2, t9);
    			append(p2, span1);

    			if (/*q*/ ctx[1].date !== void 0) {
    				span1.textContent = /*q*/ ctx[1].date;
    			}

    			append(div4, t10);
    			append(div4, span2);
    			append(span2, t11);
    			append(div4, t12);
    			append(div4, h21);

    			if (/*q*/ ctx[1].clientName !== void 0) {
    				h21.textContent = /*q*/ ctx[1].clientName;
    			}

    			append(div4, t13);
    			append(div4, p3);

    			if (/*q*/ ctx[1].clientId !== void 0) {
    				p3.textContent = /*q*/ ctx[1].clientId;
    			}

    			append(div4, t14);
    			append(div4, p4);

    			if (/*q*/ ctx[1].clientAddress !== void 0) {
    				p4.textContent = /*q*/ ctx[1].clientAddress;
    			}

    			append(div7, t15);
    			append(div7, div6);
    			if (if_block0) if_block0.m(div6, null);
    			append(div6, t16);
    			append(div6, span3);
    			append(span3, t17);
    			append(div6, t18);
    			append(div6, p5);

    			if (/*q*/ ctx[1].paymethod !== void 0) {
    				p5.textContent = /*q*/ ctx[1].paymethod;
    			}

    			append(div6, t19);
    			append(div6, div5);
    			append(div5, h22);
    			append(h22, t20);
    			append(div5, t21);
    			append(div5, p6);
    			append(p6, t22);
    			append(div12, t23);
    			append(div12, table);
    			append(table, thead);
    			append(thead, tr0);
    			append(tr0, td0);
    			append(td0, t24);
    			append(tr0, t25);
    			append(tr0, td1);
    			append(td1, div8);
    			append(div8, p7);
    			append(p7, t26);
    			append(div8, t27);
    			append(div8, button0);
    			append(div8, t28);
    			append(div8, button1);
    			append(tr0, t29);
    			append(tr0, td2);
    			append(td2, t30);
    			append(tr0, t31);
    			append(tr0, td3);
    			append(td3, t32);
    			append(tr0, t33);
    			append(tr0, td4);
    			append(td4, t34);
    			append(table, t35);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			append(table, t36);
    			append(table, tfoot);
    			append(tfoot, tr1);
    			append(tr1, td5);
    			append(td5, span4);
    			append(span4, t37);
    			append(td5, t38);
    			append(td5, p8);

    			if (/*q*/ ctx[1].note !== void 0) {
    				p8.textContent = /*q*/ ctx[1].note;
    			}

    			append(tr1, t39);
    			append(tr1, td6);
    			append(td6, t40);
    			append(tr1, t41);
    			append(tr1, td7);
    			append(td7, t42);
    			append(tfoot, t43);
    			append(tfoot, tr2);
    			append(tr2, td8);
    			append(td8, span5);
    			append(span5, t44);
    			append(td8, t45);
    			append(td8, span6);
    			append(td8, t46);
    			append(td8, span8);
    			append(span8, span7);
    			append(span7, t47);
    			append(tr2, t48);
    			append(tr2, td9);
    			append(td9, t49);
    			append(tfoot, t50);
    			if (if_block1) if_block1.m(tfoot, null);
    			append(tfoot, t51);
    			append(tfoot, tr3);
    			append(tr3, td10);
    			append(td10, t52);
    			append(tr3, t53);
    			append(tr3, td11);
    			append(td11, t54);
    			append(div12, t55);
    			append(div12, div11);
    			append(div11, div9);
    			append(div9, h30);
    			append(h30, t56);
    			append(div9, t57);
    			append(div9, p9);
    			append(div9, t58);
    			append(div9, p10);
    			append(div11, t59);
    			append(div11, div10);
    			append(div10, h31);
    			append(h31, t60);
    			append(div10, t61);
    			append(div10, p11);
    			append(div10, t62);
    			append(div10, p12);
    			insert(target, t63, anchor);
    			insert(target, div13, anchor);
    			append(div13, button2);

    			if (!mounted) {
    				dispose = [
    					listen(h20, "input", /*h20_input_handler*/ ctx[10]),
    					listen(p0, "input", /*p0_input_handler*/ ctx[11]),
    					listen(p1, "input", /*p1_input_handler*/ ctx[12]),
    					listen(span0, "input", /*span0_input_handler*/ ctx[13]),
    					listen(span1, "input", /*span1_input_handler*/ ctx[14]),
    					listen(h21, "input", /*h21_input_handler*/ ctx[15]),
    					listen(p3, "input", /*p3_input_handler*/ ctx[16]),
    					listen(p4, "input", /*p4_input_handler*/ ctx[17]),
    					listen(p5, "input", /*p5_input_handler*/ ctx[19]),
    					listen(button0, "click", /*addItem*/ ctx[6]),
    					listen(button1, "click", /*removeItem*/ ctx[7]),
    					listen(p8, "input", /*p8_input_handler*/ ctx[27]),
    					listen(span7, "focus", /*focus_handler_2*/ ctx[28]),
    					listen(span7, "input", /*input_handler_2*/ ctx[29]),
    					listen(span7, "blur", /*blur_handler_2*/ ctx[30]),
    					listen(td11, "focus", /*focus_handler_4*/ ctx[34]),
    					listen(td11, "input", /*input_handler_4*/ ctx[35]),
    					listen(td11, "blur", /*blur_handler_4*/ ctx[36]),
    					listen(button2, "click", /*click_handler_2*/ ctx[37])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*data, q*/ 3 && link_href_value !== (link_href_value = /*data*/ ctx[0][/*q*/ ctx[1].lang]['font-link'])) {
    				attr(link, "href", link_href_value);
    			}

    			if (dirty[0] & /*q, data*/ 3) {
    				each_value_2 = Object.keys(/*data*/ ctx[0]);
    				each_blocks_2 = update_keyed_each(each_blocks_2, dirty, get_key, 1, ctx, each_value_2, each0_lookup, div0, destroy_block, create_each_block_2, t1, get_each_context_2);
    			}

    			if (dirty[0] & /*q, data*/ 3) {
    				each_value_1 = Object.keys(/*data*/ ctx[0][/*q*/ ctx[1].lang].label);
    				each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key_1, 1, ctx, each_value_1, each1_lookup, div0, destroy_block, create_each_block_1, null, get_each_context_1);
    			}

    			if (dirty[0] & /*q*/ 2 && !src_url_equal(img.src, img_src_value = /*q*/ ctx[1].vendorLogo)) {
    				attr(img, "src", img_src_value);
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].vendorName !== h20.textContent) {
    				h20.textContent = /*q*/ ctx[1].vendorName;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].vendorId !== p0.textContent) {
    				p0.textContent = /*q*/ ctx[1].vendorId;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].vendorAddress !== p1.textContent) {
    				p1.textContent = /*q*/ ctx[1].vendorAddress;
    			}

    			if (dirty[0] & /*l*/ 4 && t7_value !== (t7_value = /*l*/ ctx[2].title + "")) set_data(t7, t7_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].ref !== span0.textContent) {
    				span0.textContent = /*q*/ ctx[1].ref;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].date !== span1.textContent) {
    				span1.textContent = /*q*/ ctx[1].date;
    			}

    			if (dirty[0] & /*l*/ 4 && t11_value !== (t11_value = /*l*/ ctx[2].client + "")) set_data(t11, t11_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].clientName !== h21.textContent) {
    				h21.textContent = /*q*/ ctx[1].clientName;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].clientId !== p3.textContent) {
    				p3.textContent = /*q*/ ctx[1].clientId;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].clientAddress !== p4.textContent) {
    				p4.textContent = /*q*/ ctx[1].clientAddress;
    			}

    			if (/*q*/ ctx[1].doc !== 'receipt') {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					if_block0.m(div6, t16);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (dirty[0] & /*l*/ 4 && t17_value !== (t17_value = /*l*/ ctx[2].paymethod + "")) set_data(t17, t17_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].paymethod !== p5.textContent) {
    				p5.textContent = /*q*/ ctx[1].paymethod;
    			}

    			if (dirty[0] & /*q*/ 2 && t20_value !== (t20_value = /*price*/ ctx[3](/*q*/ ctx[1].totalFinal) + "")) set_data(t20, t20_value);
    			if (dirty[0] & /*l*/ 4 && t22_value !== (t22_value = /*l*/ ctx[2].totalFinal + "")) set_data(t22, t22_value);
    			if (dirty[0] & /*l*/ 4 && t24_value !== (t24_value = /*l*/ ctx[2].itemNo + "")) set_data(t24, t24_value);
    			if (dirty[0] & /*l*/ 4 && t26_value !== (t26_value = /*l*/ ctx[2].itemDesc + "")) set_data(t26, t26_value);
    			if (dirty[0] & /*l*/ 4 && t30_value !== (t30_value = /*l*/ ctx[2].itemPrice + "")) set_data(t30, t30_value);
    			if (dirty[0] & /*l*/ 4 && t32_value !== (t32_value = /*l*/ ctx[2].itemQty + "")) set_data(t32, t32_value);
    			if (dirty[0] & /*l*/ 4 && t34_value !== (t34_value = /*l*/ ctx[2].itemAmount + "")) set_data(t34, t34_value);

    			if (dirty[0] & /*price, q, qty*/ 26) {
    				each_value = /*q*/ ctx[1].itemDesc;
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key_2, 1, ctx, each_value, each2_lookup, tbody, destroy_block, create_each_block, null, get_each_context);
    			}

    			if (dirty[0] & /*l*/ 4 && t37_value !== (t37_value = /*l*/ ctx[2].note + "")) set_data(t37, t37_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].note !== p8.textContent) {
    				p8.textContent = /*q*/ ctx[1].note;
    			}

    			if (dirty[0] & /*q*/ 2 && td5_rowspan_value !== (td5_rowspan_value = /*q*/ ctx[1].doc === 'receipt' ? 4 : 3)) {
    				attr(td5, "rowspan", td5_rowspan_value);
    			}

    			if (dirty[0] & /*l*/ 4 && t40_value !== (t40_value = /*l*/ ctx[2].totalAmount + "")) set_data(t40, t40_value);
    			if (dirty[0] & /*q*/ 2 && t42_value !== (t42_value = /*price*/ ctx[3](/*q*/ ctx[1].totalAmount) + "")) set_data(t42, t42_value);
    			if (dirty[0] & /*l*/ 4 && t44_value !== (t44_value = /*l*/ ctx[2].totalVat + "")) set_data(t44, t44_value);
    			if (dirty[0] & /*q*/ 2 && t47_value !== (t47_value = /*rate*/ ctx[5](/*q*/ ctx[1].vatRate) + "")) set_data(t47, t47_value);
    			if (dirty[0] & /*q*/ 2 && t49_value !== (t49_value = /*price*/ ctx[3](/*q*/ ctx[1].totalVat) + "")) set_data(t49, t49_value);

    			if (/*q*/ ctx[1].doc === 'receipt') {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					if_block1.m(tfoot, t51);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty[0] & /*l*/ 4 && t52_value !== (t52_value = /*l*/ ctx[2].totalAdjust + "")) set_data(t52, t52_value);
    			if (dirty[0] & /*q*/ 2 && t54_value !== (t54_value = /*price*/ ctx[3](/*q*/ ctx[1].totalAdjust) + "")) set_data(t54, t54_value);
    			if (dirty[0] & /*l*/ 4 && t56_value !== (t56_value = /*l*/ ctx[2].vendorSign + "")) set_data(t56, t56_value);
    			if (dirty[0] & /*l*/ 4 && t60_value !== (t60_value = /*l*/ ctx[2].clientSign + "")) set_data(t60, t60_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			detach(link);
    			if (detaching) detach(t0);
    			if (detaching) detach(div0);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].d();
    			}

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].d();
    			}

    			if (detaching) detach(t2);
    			if (detaching) detach(div12);
    			if (if_block0) if_block0.d();

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (if_block1) if_block1.d();
    			if (detaching) detach(t63);
    			if (detaching) detach(div13);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let l = data[""].label[""];
    	let q = data[""].q;

    	const price = number => {
    		number = Number(number);

    		if (number === 0 || isNaN(number)) {
    			return "";
    		}

    		return `${q.currency} ${number.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		})}`;
    	};

    	const qty = number => {
    		number = Number(number);

    		if (number === 0 || isNaN(number)) {
    			return "";
    		}

    		return number;
    	};

    	const rate = rate => {
    		rate = Number(rate) * 100;

    		if (!Number.isInteger(rate)) {
    			rate = rate.toFixed(2);
    		}

    		return `${rate} %`;
    	};

    	const addItem = () => {
    		q.itemDesc.push("");
    		q.itemPrice.push("");
    		q.itemQty.push("");
    		$$invalidate(1, q);
    	};

    	const removeItem = () => {
    		q.itemDesc.pop();
    		q.itemPrice.pop();
    		q.itemQty.pop();
    		$$invalidate(1, q);
    	};

    	onMount(() => {
    		const s = new URLSearchParams(location.search);
    		let obj = q;

    		Object.keys(q).forEach(key => {
    			const values = s.getAll(key);

    			if (values.length > 0) {
    				if (Array.isArray(q[key])) {
    					obj[key] = values;
    					return;
    				}

    				obj[key] = values[0];
    			}
    		});

    		$$invalidate(1, q = { ...data[q.lang].q, ...obj });
    	});

    	const click_handler = lng => {
    		$$invalidate(1, q.lang = lng, q);
    	};

    	const click_handler_1 = dc => {
    		$$invalidate(1, q.doc = dc, q);
    	};

    	function h20_input_handler() {
    		q.vendorName = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p0_input_handler() {
    		q.vendorId = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p1_input_handler() {
    		q.vendorAddress = this.textContent;
    		$$invalidate(1, q);
    	}

    	function span0_input_handler() {
    		q.ref = this.textContent;
    		$$invalidate(1, q);
    	}

    	function span1_input_handler() {
    		q.date = this.textContent;
    		$$invalidate(1, q);
    	}

    	function h21_input_handler() {
    		q.clientName = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p3_input_handler() {
    		q.clientId = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p4_input_handler() {
    		q.clientAddress = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p_input_handler() {
    		q.duedate = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p5_input_handler() {
    		q.paymethod = this.textContent;
    		$$invalidate(1, q);
    	}

    	function td1_input_handler(i) {
    		q.itemDesc[i] = this.textContent;
    		$$invalidate(1, q);
    	}

    	const focus_handler = (i, e) => e.target.textContent = q.itemPrice[i];
    	const input_handler = (i, e) => $$invalidate(1, q.itemPrice[i] = e.target.textContent, q);
    	const blur_handler = (i, e) => e.target.textContent = price(q.itemPrice[i]);
    	const focus_handler_1 = (i, e) => e.target.textContent = q.itemQty[i];
    	const input_handler_1 = (i, e) => $$invalidate(1, q.itemQty[i] = e.target.textContent, q);
    	const blur_handler_1 = (i, e) => e.target.textContent = qty(q.itemQty[i]);

    	function p8_input_handler() {
    		q.note = this.textContent;
    		$$invalidate(1, q);
    	}

    	const focus_handler_2 = e => e.target.textContent = q.vatRate;
    	const input_handler_2 = e => $$invalidate(1, q.vatRate = e.target.textContent, q);
    	const blur_handler_2 = e => e.target.textContent = rate(q.vatRate);
    	const focus_handler_3 = e => e.target.textContent = q.whtRate;
    	const input_handler_3 = e => $$invalidate(1, q.whtRate = e.target.textContent, q);
    	const blur_handler_3 = e => e.target.textContent = rate(q.whtRate);
    	const focus_handler_4 = e => e.target.textContent = q.totalAdjust;
    	const input_handler_4 = e => $$invalidate(1, q.totalAdjust = e.target.textContent, q);
    	const blur_handler_4 = e => e.target.textContent = price(q.totalAdjust);
    	const click_handler_2 = () => window.print();

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(0, data = $$props.data);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(
    				1,
    				q.itemAmount = q.itemPrice.map((pr, i) => {
    					const num = Number(pr) * Number(q.itemQty[i]);
    					return num ? num : "";
    				}),
    				q
    			);
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(
    				1,
    				q.totalAmount = q.itemAmount.reduce(
    					(a, b) => {
    						const num = Number(a) + Number(b);
    						return num ? num : "";
    					},
    					0
    				),
    				q
    			);
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(1, q.totalVat = Number(q.totalAmount) * Number(q.vatRate), q);
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(1, q.totalWht = Number(q.totalAmount) * Number(q.whtRate), q);
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(1, q.totalFinal = Number(q.totalAmount) + Number(q.totalVat) + Number(q.totalWht) + Number(q.totalAdjust), q);
    		}

    		if ($$self.$$.dirty[0] & /*data, q*/ 3) {
    			{
    				document.body.style = data[q.lang]["font-style"];
    			}
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			{

    				Object.keys(q).forEach(key => {
    					const values = q[key];

    					if (values) {
    						if (Array.isArray(values)) {
    							values.forEach(value => {
    							});

    							return;
    						}
    					}
    				});
    			}
    		}

    		if ($$self.$$.dirty[0] & /*data, q*/ 3) {
    			$$invalidate(2, l = {
    				...data[q.lang].label[""],
    				...data[q.lang].label[q.doc]
    			});
    		}
    	};

    	return [
    		data,
    		q,
    		l,
    		price,
    		qty,
    		rate,
    		addItem,
    		removeItem,
    		click_handler,
    		click_handler_1,
    		h20_input_handler,
    		p0_input_handler,
    		p1_input_handler,
    		span0_input_handler,
    		span1_input_handler,
    		h21_input_handler,
    		p3_input_handler,
    		p4_input_handler,
    		p_input_handler,
    		p5_input_handler,
    		td1_input_handler,
    		focus_handler,
    		input_handler,
    		blur_handler,
    		focus_handler_1,
    		input_handler_1,
    		blur_handler_1,
    		p8_input_handler,
    		focus_handler_2,
    		input_handler_2,
    		blur_handler_2,
    		focus_handler_3,
    		input_handler_3,
    		blur_handler_3,
    		focus_handler_4,
    		input_handler_4,
    		blur_handler_4,
    		click_handler_2
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { data: 0 }, null, [-1, -1]);
    	}
    }

    let data = {
    	"": {
    		"font-link":
    			"https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap",
    		"font-style": "font-family: 'Kaushan Script', cursive;",
    		label: {
    			"": {
    				title: "Invoice",
    				ref: "No",
    				date: "Date",
    				duedate: "Due Date",
    				client: "Bill to",
    				paymethod: "Payment",
    				itemNo: "No",
    				itemDesc: "Description",
    				itemPrice: "Price",
    				itemQty: "Qty",
    				itemAmount: "Amount",
    				totalAmount: "Subtotal",
    				totalVat: "Vat",
    				totalWht: "Tax withheld",
    				totalAdjust: "Adjust",
    				totalFinal: "Pay Amount",
    				note: "Note",
    				vendorSign: "Vendor Signature",
    				clientSign: "Client Signature"
    			},
    			quotation: {
    				title: "Quotation",
    				duedate: "Offer Until",
    				client: "Offer to"
    			},
    			receipt: {
    				title: "Receipt",
    				client: "Received from",
    				totalFinal: "Paid Amount",
    				vendorSign: "Receiver Signature"
    			},
    			"tax-invoice": {
    				title: "Tax Invoice"
    			}
    		},
    		q: {
    			lang: "",
    			doc: "",
    			currency: "$",
    			vendorLogo: "",
    			ref: Math.random().toString().slice(2, 8),
    			date: new Date().toLocaleDateString(undefined),
    			duedate: "...",
    			vendorName: "Vendor Name",
    			vendorId: "Register",
    			vendorAddress: "Address",
    			clientName: "Client Name",
    			clientId: "Register",
    			clientAddress: "Address",
    			paymethod: "...",
    			itemDesc: ["", "", "", "", ""],
    			itemPrice: ["", "", "", "", ""],
    			itemQty: ["", "", "", "", ""],
    			vatRate: "0.05",
    			whtRate: "0",
    			totalAdjust: "",
    			note: ""
    		}
    	},
    	th: {
    		"font-link":
    			"https://fonts.googleapis.com/css2?family=Srisakdi:wght@700&display=swap",
    		"font-style": "font-family: 'Srisakdi', cursive; font-weight: 700;",
    		label: {
    			"": {
    				title: "ใบแจ้งหนี้",
    				ref: "เลขที่",
    				date: "วันที่",
    				duedate: "ชำระภายใน",
    				client: "ส่งถึง",
    				paymethod: "วิธีชำระเงิน",
    				itemNo: "#",
    				itemDesc: "รายการ",
    				itemPrice: "ราคา",
    				itemQty: "จำนวน",
    				itemAmount: "จำนวนเงิน",
    				totalAmount: "รวม",
    				totalVat: "ภาษีมูลค่าเพิ่ม",
    				totalWht: "หัก ณ ที่จ่าย",
    				totalAdjust: "ปรับปรุง",
    				totalFinal: "ยอดชำระ",
    				note: "หมายเหตุ",
    				vendorSign: "ลายเซ็นผู้ขาย",
    				clientSign: "ลายเซ็นผู้ซื้อ"
    			},
    			quotation: {
    				title: "ใบเสนอราคา",
    				duedate: "สั่งซื้อก่อนวันที่",
    				client: "ส่งถึง"
    			},
    			receipt: {
    				title: "ใบเสร็จรับเงิน",
    				client: "รับเงินจาก",
    				totalFinal: "ยอดชำระ",
    				vendorSign: "ลายเซ็นผู้รับเงิน"
    			},
    			"tax-invoice": {
    				title: "ใบกำกับภาษี"
    			}
    		},
    		q: {
    			lang: "th",
    			doc: "",
    			currency: "฿",
    			vendorLogo: "",
    			ref: Math.random().toString().slice(2, 8),
    			date: new Date().toLocaleDateString("th"),
    			duedate: "...",
    			vendorName: "ชื่อผู้ขาย",
    			vendorId: "เลขประจำตัว",
    			vendorAddress: "ที่อยู่",
    			clientName: "ชื่อลูกค้า",
    			clientId: "เลขประจำตัว",
    			clientAddress: "ที่อยู่",
    			paymethod: "...",
    			itemDesc: ["", "", "", "", ""],
    			itemPrice: ["", "", "", "", ""],
    			itemQty: ["", "", "", "", ""],
    			vatRate: "0.07",
    			whtRate: "0",
    			totalAdjust: "",
    			note: ""
    		}
    	}
    };

    const app = new App({
    	target: document.getElementById("_app"),
    	props: { data }
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
