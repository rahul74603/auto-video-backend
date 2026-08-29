'use strict';

/**
 * tests/helpers/growth_mock_db.js — In-memory Firestore mock for the Growth
 * Self-Learning behavioral tests. Supports the exact query surface the
 * growth stack uses: collection().doc(id).get/set/update, collection().add(),
 * and chainable where/orderBy/limit/get with real filtering & sorting.
 */

function createMockDb(seedData = {}) {
    const collections = new Map();

    function ensure(name) {
        if (!collections.has(name)) {
            const seed = seedData[name] || {};
            const map = new Map();
            for (const [id, data] of Object.entries(seed)) {
                map.set(id, JSON.parse(JSON.stringify(data)));
            }
            collections.set(name, map);
        }
        return collections.get(name);
    }

    function makeDoc(id, data, collName) {
        return {
            id,
            exists: true,
            data: () => JSON.parse(JSON.stringify(data)),
            ref: {
                update: async (patch) => {
                    const m = ensure(collName);
                    const cur = m.get(id) || {};
                    Object.assign(cur, JSON.parse(JSON.stringify(patch)));
                    m.set(id, cur);
                }
            }
        };
    }

    function query(collName, steps) {
        return {
            where(field, op, value) {
                return query(collName, steps.concat({ type: 'where', field, op, value }));
            },
            orderBy(field, dir) {
                return query(collName, steps.concat({ type: 'orderBy', field, dir }));
            },
            limit(n) {
                return query(collName, steps.concat({ type: 'limit', n }));
            },
            async get() {
                let entries = [...ensure(collName).entries()].map(([id, data]) => ({ id, data }));
                for (const step of steps) {
                    if (step.type === 'where') {
                        entries = entries.filter(({ data }) => {
                            const v = data[step.field];
                            switch (step.op) {
                                case '==': return v === step.value;
                                case '>=': return v !== null && v !== undefined && v >= step.value;
                                case '<=': return v !== null && v !== undefined && v <= step.value;
                                case 'in': return Array.isArray(step.value) && step.value.includes(v);
                                default: return true;
                            }
                        });
                    } else if (step.type === 'orderBy') {
                        entries.sort((a, b) => {
                            const av = a.data[step.field];
                            const bv = b.data[step.field];
                            const c = (av === undefined ? -Infinity : av) < (bv === undefined ? -Infinity : bv) ? -1
                                : (av === undefined ? -Infinity : av) > (bv === undefined ? -Infinity : bv) ? 1 : 0;
                            return step.dir === 'desc' ? -c : c;
                        });
                    } else if (step.type === 'limit') {
                        entries = entries.slice(0, step.n);
                    }
                }
                return {
                    empty: entries.length === 0,
                    docs: entries.map(({ id, data }) => makeDoc(id, data, collName))
                };
            }
        };
    }

    return {
        collection(name) {
            ensure(name);
            return {
                doc(id) {
                    return {
                        async get() {
                            const m = ensure(name);
                            const d = m.get(id);
                            return d ? makeDoc(id, d, name) : { id, exists: false, data: () => null };
                        },
                        async set(data, opts) {
                            const m = ensure(name);
                            const clean = JSON.parse(JSON.stringify(data));
                            const cur = (opts && opts.merge) ? Object.assign({}, m.get(id) || {}, clean) : clean;
                            m.set(id, cur);
                        },
                        async update(patch) {
                            const m = ensure(name);
                            const cur = m.get(id) || {};
                            Object.assign(cur, JSON.parse(JSON.stringify(patch)));
                            m.set(id, cur);
                        }
                    };
                },
                async add(data) {
                    const m = ensure(name);
                    const id = `auto-${name}-${m.size + 1}-${Math.random().toString(36).slice(2, 7)}`;
                    m.set(id, JSON.parse(JSON.stringify(data)));
                    return { id };
                },
                where: (f, o, v) => query(name, []).where(f, o, v),
                orderBy: (f, d) => query(name, []).orderBy(f, d),
                limit: (n) => query(name, []).limit(n),
                get: () => query(name, []).get()
            };
        },
        __dump(name) {
            return Object.fromEntries(ensure(name));
        },
        __collection(name) {
            return ensure(name);
        }
    };
}

/**
 * Metric-set factories used to seed realistic platform performance.
 * HIGH = clearly successful video, LOW = clearly poor video.
 */
const HIGH_METRICS = (i) => ({
    views: 40000 + i * 2000,
    likes: 1500 + i * 50,
    comments: 300 + i * 10,
    shares: 300 + i * 10,
    followersGained: 200 + i * 5,
    saves: null, watchTime: null, averageViewDuration: null, retention: null,
    completionRate: null, rewatchRate: null, clickThroughRate: null
});

const LOW_METRICS = (i) => ({
    views: 50 + i * 5,
    likes: 1 + (i % 3),
    comments: i % 2,
    shares: 0,
    followersGained: 0,
    saves: null, watchTime: null, averageViewDuration: null, retention: null,
    completionRate: null, rewatchRate: null, clickThroughRate: null
});

module.exports = { createMockDb, HIGH_METRICS, LOW_METRICS };
