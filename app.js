// County Population Trends — Frontend
// Census 2020–2025 county population estimates

const DATA_BASE = "data/";
const NUM_LETTER_SHARDS = 26;
const NUM_DETAIL_SHARDS = 256;

// --- State ---
let mode = "search";
let currentDetail = null;
let indexCache = {};
let stateFileCache = {};

function changeBadgeClass(pc) {
    if (pc > 0.5) return "change-up";
    if (pc < -0.5) return "change-down";
    return "change-flat";
}

function changeBigClass(pc) {
    if (pc > 0.5) return "up";
    if (pc < -0.5) return "down";
    return "neutral";
}

function fmtPop(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
}

function fmtChange(n) {
    const sign = n > 0 ? "+" : "";
    return sign + n.toFixed(1) + "%";
}

function fmtCount(n) {
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toLocaleString();
}

// --- UI Mode ---
function setMode(m) {
    mode = m;
    document.getElementById("mode-search").classList.toggle("active", m === "search");
    document.getElementById("mode-state").classList.toggle("active", m === "state");
    document.getElementById("search-section").style.display = m === "search" ? "block" : "none";
    document.getElementById("state-section").style.display = m === "state" ? "block" : "none";
    if (m === "search") {
        document.getElementById("search-input").focus();
    } else if (m === "state") {
        loadStates();
    }
}

// --- Search ---
function handleSearch() {
    const q = document.getElementById("search-input").value.trim();
    const container = document.getElementById("search-results");
    if (q.length === 0) { container.innerHTML = ""; return; }

    const letter = q[0].toUpperCase();
    const key = letter >= 'A' && letter <= 'Z' ? letter.toLowerCase() : "other";

    if (indexCache[key]) {
        renderSearchResults(searchIndex(indexCache[key], q), container);
        return;
    }

    container.innerHTML = '<div class="loading">Loading...</div>';
    fetchJson(`${DATA_BASE}index/${key}.json`).then(data => {
        indexCache[key] = data;
        renderSearchResults(searchIndex(data, q), container);
    }).catch(() => {
        container.innerHTML = '<div class="no-results">No data for this letter.</div>';
    });
}

function searchIndex(entries, q) {
    const ql = q.toLowerCase();
    return entries.filter(e => e.n.toLowerCase().includes(ql)).slice(0, 30);
}

function renderSearchResults(entries, container) {
    if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="no-results">No counties match that name.</div>';
        return;
    }
    container.innerHTML = entries.map(e => {
        const cls = changeBadgeClass(e.pc);
        return `<div class="result-item" onclick="showDetail('${e.f}')">
            <div class="info">
                <div class="name">${esc(e.n)}</div>
                <div class="location">${esc(e.s)} — Population ${fmtPop(e.p)}</div>
            </div>
            <span class="change-badge ${cls}">${fmtChange(e.pc)}</span>
        </div>`;
    }).join('');
}

// --- State Browse ---
function loadStates() {
    const container = document.getElementById("state-list");
    container.innerHTML = '<div class="loading">Loading...</div>';

    // Collect states from letter indices
    fetchJson(`${DATA_BASE}summary.json`).then(async () => {
        const stateMap = new Map();
        const letters = "abcdefghijklmnopqrstuvwxyz".split("");

        for (const l of letters) {
            try {
                const entries = await fetchJson(`${DATA_BASE}index/${l}.json`);
                if (!indexCache[l]) indexCache[l] = entries;
                for (const e of entries) {
                    if (!stateMap.has(e.s)) {
                        stateMap.set(e.s, { counties: 0, totalPop: 0, growing: 0, shrinking: 0 });
                    }
                    const st = stateMap.get(e.s);
                    st.counties++;
                    st.totalPop += e.p || 0;
                    if ((e.pc || 0) > 0.5) st.growing++;
                    else if ((e.pc || 0) < -0.5) st.shrinking++;
                }
            } catch (e) {}
        }

        // Also try "other"
        try {
            const entries = await fetchJson(`${DATA_BASE}index/other.json`);
            if (!indexCache["other"]) indexCache["other"] = entries;
            for (const e of entries) {
                if (!stateMap.has(e.s)) {
                    stateMap.set(e.s, { counties: 0, totalPop: 0, growing: 0, shrinking: 0 });
                }
                const st = stateMap.get(e.s);
                st.counties++;
                st.totalPop += e.p || 0;
                if ((e.pc || 0) > 0.5) st.growing++;
                else if ((e.pc || 0) < -0.5) st.shrinking++;
            }
        } catch (e) {}

        const states = Array.from(stateMap.entries()).map(([name, info]) => ({
            name, counties: info.counties, totalPop: info.totalPop,
            growing: info.growing, shrinking: info.shrinking
        }));
        states.sort((a, b) => a.name.localeCompare(b.name));

        container.innerHTML = states.map(st => {
            const growthRatio = st.counties > 0 ? ((st.growing / st.counties) * 100).toFixed(0) : 0;
            return `<div class="state-card" onclick="showStateCounties('${esc(st.name)}')">
                <div class="st-name">${esc(st.name)}</div>
                <div class="st-stats">
                    <span>${st.counties} counties</span>
                    <span>${fmtPop(st.totalPop)} pop.</span>
                    <span>${growthRatio}% growing</span>
                </div>
            </div>`;
        }).join('');
    }).catch(() => {
        container.innerHTML = '<div class="no-results">Could not load data.</div>';
    });
}

function showStateCounties(stateName) {
    document.getElementById("state-list").style.display = "none";
    const container = document.getElementById("state-counties");
    container.style.display = "block";
    container.innerHTML = '<div class="loading">Loading...</div>';

    // Load state file
    const stateKey = stateName.toLowerCase().replace(/\s+/g, "-");
    fetchJson(`${DATA_BASE}state/${stateKey}.json`).then(data => {
        const counties = data.entries;
        container.innerHTML = `
            <div style="margin-bottom:14px">
                <button class="back" onclick="backToStates()">← Back to all states</button>
                <h3 style="display:inline;margin-left:10px">${esc(stateName)} — ${counties.length} counties, ${fmtPop(data.total_pop)} total pop.</h3>
            </div>
            ${counties.map(e => {
                const cls = changeBadgeClass(e.pc);
                return `<div class="result-item" onclick="showDetail('${e.f}')">
                    <div class="info">
                        <div class="name">${esc(e.n)}</div>
                        <div class="location">Population ${fmtPop(e.p)}</div>
                    </div>
                    <span class="change-badge ${cls}">${fmtChange(e.pc)}</span>
                </div>`;
            }).join('')}
        `;
    }).catch(() => {
        container.innerHTML = '<div class="no-results">Could not load state data.</div>';
    });
}

function backToStates() {
    document.getElementById("state-list").style.display = "grid";
    document.getElementById("state-counties").style.display = "none";
    document.getElementById("state-counties").innerHTML = "";
}

// --- Detail ---
async function showDetail(fips) {
    const prefix = md5(fips.toLowerCase()).substring(0, 2);
    const panel = document.getElementById("detail-panel");
    panel.innerHTML = '<div class="loading">Loading...</div>';
    panel.classList.add("active");
    document.getElementById("search-results").innerHTML = "";
    document.getElementById("state-counties").innerHTML = "";
    document.getElementById("state-list").style.display = "grid";
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
        const shard = await fetchJson(`${DATA_BASE}detail/${prefix}.json`);
        const d = shard[fips];
        if (!d) { panel.innerHTML = '<div class="no-results">County not found.</div>'; return; }
        currentDetail = d;
        renderDetail(d);
    } catch (e) {
        panel.innerHTML = '<div class="no-results">Could not load county data.</div>';
    }
}

function renderDetail(d) {
    const panel = document.getElementById("detail-panel");
    const changeCls = changeBigClass(d.pc);
    const changeIcon = d.pc > 0.5 ? "↗" : d.pc < -0.5 ? "↘" : "→";

    // Yearly trend
    const years = Object.keys(d.yr || {}).sort();
    const pops = years.map(y => d.yr[y].p || 0);
    const maxPop = Math.max(...pops, 1);
    const minPop = Math.min(...pops, 1);
    const range = maxPop - minPop || 1;

    // Components summary
    const totalB = d.b || 0;
    const totalD = d.d || 0;
    const totalNM = d.nm || 0;
    const maxComp = Math.max(Math.abs(totalB), Math.abs(totalD), Math.abs(totalNM), 1);

    panel.innerHTML = `
        <button class="back" onclick="hideDetail()">← Back to search</button>
        <h2>${esc(d.n)}, ${esc(d.s)}</h2>
        <div class="subtitle">Population trend 2020–2025</div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="big">${fmtPop(d.p)}</div>
                <div class="small">2025 Population</div>
            </div>
            <div class="stat-card">
                <div class="big ${changeCls}">${changeIcon} ${fmtChange(d.pc)}</div>
                <div class="small">Change 2020–2025</div>
            </div>
            <div class="stat-card">
                <div class="big">${fmtCount(totalB)}</div>
                <div class="small">Births (2020–2025)</div>
            </div>
            <div class="stat-card">
                <div class="big">${fmtCount(totalD)}</div>
                <div class="small">Deaths (2020–2025)</div>
            </div>
            <div class="stat-card">
                <div class="big ${totalNM > 0 ? 'up' : totalNM < 0 ? 'down' : 'neutral'}">${totalNM > 0 ? '+' : ''}${fmtCount(totalNM)}</div>
                <div class="small">Net Migration</div>
            </div>
        </div>

        <div class="section">
            <h3>Population Trend</h3>
            <div class="trend-chart">
                ${years.map(y => {
                    const pop = d.yr[y].p || 0;
                    const h = Math.max(((pop - minPop) / range) * 100, 4);
                    return `<div class="trend-bar-wrap">
                        <div class="trend-bar" style="height:${h}px;background:var(--accent)" title="${y}: ${fmtPop(pop)}"></div>
                        <div class="trend-pop">${fmtPop(pop)}</div>
                        <div class="trend-label">${y}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <div class="section">
            <h3>Components of Change (2020–2025 cumulative)</h3>
            <div class="cat-breakdown">
                <div class="component-row">
                    <div class="label">Births</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(Math.abs(totalB) / maxComp * 100, 1)}%;background:#4ecca3"></div></div>
                    <div class="count">${totalB >= 0 ? '+' : ''}${fmtCount(totalB)}</div>
                </div>
                <div class="component-row">
                    <div class="label">Deaths</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(Math.abs(totalD) / maxComp * 100, 1)}%;background:#e74c3c"></div></div>
                    <div class="count">${totalD >= 0 ? '−' : '+'}${fmtCount(totalD)}</div>
                </div>
                <div class="component-row">
                    <div class="label">Net Migration</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(Math.abs(totalNM) / maxComp * 100, 1)}%;background:${totalNM >= 0 ? '#4fa0cf' : '#f39c12'}"></div></div>
                    <div class="count">${totalNM >= 0 ? '+' : ''}${fmtCount(totalNM)}</div>
                </div>
            </div>
            <div style="font-size:0.75em;color:var(--text2);margin-top:8px">
                Natural change (births − deaths): <b>${totalB - totalD >= 0 ? '+' : ''}${fmtCount(totalB - totalD)}</b>
                ${Math.abs(totalNM) > Math.abs(totalB - totalD) ? ' — migration is the dominant driver of population change' : ' — natural change is the dominant driver of population change'}
            </div>
        </div>

        <div class="section">
            <h3>Year-by-Year Detail</h3>
            <div style="font-size:0.8em;color:var(--text2)">
                ${years.map(y => {
                    const yr = d.yr[y];
                    const yChange = yr.p - (d.yr[String(parseInt(y)-1)] ? d.yr[String(parseInt(y)-1)].p : yr.p);
                    const ySign = yChange >= 0 ? '+' : '';
                    return `<div style="margin-bottom:4px">
                        <b>${y}:</b> Pop ${fmtPop(yr.p)} (${ySign}${fmtCount(yChange)}),
                        ${fmtCount(yr.b)} births, ${fmtCount(yr.d)} deaths,
                        net migration ${yr.m >= 0 ? '+' : ''}${fmtCount(yr.m)}
                    </div>`;
                }).join('')}
            </div>
        </div>

        <div class="section">
            <h3>About This Data</h3>
            <p style="font-size:0.85em;color:var(--text2)">
                Population estimates from the U.S. Census Bureau's Population Estimates Program.
                Estimates are as of July 1 each year. Components of change reflect births, deaths,
                and net migration (domestic + international) between July 1 of the previous year
                and July 1 of the estimate year. 2020 estimates reflect the April 1, 2020 Census base.
                Data covers all 3,144 counties and county equivalents in the United States.
            </p>
        </div>
    `;
}

function hideDetail() {
    document.getElementById("detail-panel").classList.remove("active");
    currentDetail = null;
}

// --- Utilities ---
async function fetchJson(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
}

function esc(s) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// MD5 implementation (pure JS, for FIPS → shard prefix mapping)
function md5(A){function B(B,C){return B<<C|B>>>32-C}function C(B,C){var D,E,F,G,H;F=2147483648&B,G=2147483648&C;D=1073741824&B,E=1073741824&C;H=(1073741823&B)+(1073741823&C);return D&E?H^2147483648^F^G:D|E?1073741824&H?H^3221225472^F^G:H^1073741824^F^G:H^F^G}function D(A,D,E,F,G,H,I){A=C(A,C(C(function(B,C,D){return B&C|~B&D}(D,E,F),G),I));return C(B(A,H),D)}function E(A,D,E,F,G,H,I){A=C(A,C(C(function(B,C,D){return B&D|C&~D}(D,E,F),G),I));return C(B(A,H),D)}function F(A,D,E,F,G,H,I){A=C(A,C(C(function(B,C,D){return B^C^D}(D,E,F),G),I));return C(B(A,H),D)}function G(A,D,E,F,G,H,I){A=C(A,C(C(function(B,C,D){return C^(B|~D)}(D,E,F),G),I));return C(B(A,H),D)}function H(A){var B,D=A.length,E=D+8,F=(E-E%64)/64,G=16*(F+1),H=Array(G-1),I=0,J=0;while(J<D)B=(J-J%4)/4,I=J%4*8,H[B]=H[B]|A.charCodeAt(J)<<I,J++;B=(J-J%4)/4;I=J%4*8;H[B]=H[B]|128<<I;H[G-2]=D<<3;H[G-1]=D>>>29;return H}function I(A){var B,C,D="",E="";for(C=0;C<=3;C++)B=A>>>8*C&255,E="0"+B.toString(16),D=D+E.substr(E.length-2,2);return D}var J=Array(),K,L,M,N,O,P,Q,R,S,T=7,U=12,V=17,W=22,X=5,Y=9,Z=13,$=14,_=4,a=11,b=16,c=23,d=6,e=10,f=15,g=21;A=function(A){for(var A=A.replace(/\r\n/g,"\n"),B="",C=0;C<A.length;C++){var D=A.charCodeAt(C);D<128?B+=String.fromCharCode(D):D>127&&D<2048?(B+=String.fromCharCode(D>>6|192),B+=String.fromCharCode(63&D|128)):(B+=String.fromCharCode(D>>12|224),B+=String.fromCharCode(D>>6&63|128),B+=String.fromCharCode(63&D|128))}return B}(A);J=H(A);P=1732584193;Q=4023233417;R=2562383102;S=271733878;for(K=0;K<J.length;K+=16){L=P;M=Q;N=R;O=S;P=D(P,Q,R,S,J[K+0],T,3614090360);S=D(S,P,Q,R,J[K+1],U,3905402710);R=D(R,S,P,Q,J[K+2],V,606105819);Q=D(Q,R,S,P,J[K+3],W,3250441966);P=D(P,Q,R,S,J[K+4],T,4118548399);S=D(S,P,Q,R,J[K+5],U,1200080426);R=D(R,S,P,Q,J[K+6],V,2821735955);Q=D(Q,R,S,P,J[K+7],W,4249261313);P=D(P,Q,R,S,J[K+8],T,1770035416);S=D(S,P,Q,R,J[K+9],U,2336552879);R=D(R,S,P,Q,J[K+10],V,4294925233);Q=D(Q,R,S,P,J[K+11],W,2304563134);P=D(P,Q,R,S,J[K+12],T,1804603682);S=D(S,P,Q,R,J[K+13],U,4254626195);R=D(R,S,P,Q,J[K+14],V,2792965006);Q=D(Q,R,S,P,J[K+15],W,1236535329);P=E(P,Q,R,S,J[K+1],X,4129170786);S=E(S,P,Q,R,J[K+6],Y,3225465664);R=E(R,S,P,Q,J[K+11],Z,643717713);Q=E(Q,R,S,P,J[K+0],$,3921069994);P=E(P,Q,R,S,J[K+5],X,3593408605);S=E(S,P,Q,R,J[K+10],Y,38016083);R=E(R,S,P,Q,J[K+15],Z,3634488961);Q=E(Q,R,S,P,J[K+4],$,3889429448);P=E(P,Q,R,S,J[K+9],X,568446438);S=E(S,P,Q,R,J[K+14],Y,3275163606);R=E(R,S,P,Q,J[K+3],Z,4107603335);Q=E(Q,R,S,P,J[K+8],$,1163531501);P=E(P,Q,R,S,J[K+13],X,2850285829);S=E(S,P,Q,R,J[K+2],Y,4243563512);R=E(R,S,P,Q,J[K+7],Z,1735328473);Q=E(Q,R,S,P,J[K+12],$,2368359562);P=F(P,Q,R,S,J[K+5],_,4294588738);S=F(S,P,Q,R,J[K+8],a,2272392833);R=F(R,S,P,Q,J[K+11],b,1839030562);Q=F(Q,R,S,P,J[K+14],c,4259657740);P=F(P,Q,R,S,J[K+1],_,2763975236);S=F(S,P,Q,R,J[K+4],a,1272893353);R=F(R,S,P,Q,J[K+7],b,4139469664);Q=F(Q,R,S,P,J[K+10],c,3200236656);P=F(P,Q,R,S,J[K+13],_,681279174);S=F(S,P,Q,R,J[K+0],a,3936430074);R=F(R,S,P,Q,J[K+3],b,3572445317);Q=F(Q,R,S,P,J[K+6],c,76029189);P=F(P,Q,R,S,J[K+9],_,3654602809);S=F(S,P,Q,R,J[K+12],a,3873151461);R=F(R,S,P,Q,J[K+15],b,530742520);Q=F(Q,R,S,P,J[K+2],c,3299628645);P=G(P,Q,R,S,J[K+0],d,4096336452);S=G(S,P,Q,R,J[K+7],e,1126891415);R=G(R,S,P,Q,J[K+14],f,2878612391);Q=G(Q,R,S,P,J[K+5],g,4237533241);P=G(P,Q,R,S,J[K+12],d,1700485571);S=G(S,P,Q,R,J[K+3],e,2399980690);R=G(R,S,P,Q,J[K+10],f,4293915773);Q=G(Q,R,S,P,J[K+1],g,2240044497);P=G(P,Q,R,S,J[K+8],d,1873313359);S=G(S,P,Q,R,J[K+15],e,4264355552);R=G(R,S,P,Q,J[K+6],f,2734768916);Q=G(Q,R,S,P,J[K+13],g,1309151649);P=G(P,Q,R,S,J[K+4],d,4149444226);S=G(S,P,Q,R,J[K+11],e,3174756917);R=G(R,S,P,Q,J[K+2],f,718787259);Q=G(Q,R,S,P,J[K+9],g,3951481745);P=C(P,L);Q=C(Q,M);R=C(R,N);S=C(S,O)}return(I(P)+I(Q)+I(R)+I(S)).toLowerCase()};

// Init
setMode("search");
