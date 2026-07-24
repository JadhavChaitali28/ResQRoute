// ==========================================
// RESQROUTE SERVER - PART 1 OF 3
// ==========================================
const express = require('express');
const path = require('path');
const PouchDB = require('pouchdb');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// 1. Initialize Embedded Local PouchDB (Saves directly to D:\ResQroute\resqroute_db)
const db = new PouchDB('resqroute_db');
console.log('🗄️ Embedded PouchDB Initialized: Data saved locally to disk.');

// 2. Optional CouchDB Remote Sync (Attempts connection gracefully)
const COUCHDB_URL = 'http://admin:password@127.0.0.1:5984/resqroute';
try {
    const remoteCouch = new PouchDB(COUCHDB_URL);
    db.sync(remoteCouch, { live: true, retry: true })
        .on('change', info => console.log('🔄 COUCHDB LIVE SYNC:', info))
        .on('error', err => {}); // Silent fallback to local PouchDB disk storage
} catch (e) {
    console.log('ℹ️ Running in Standalone Embedded PouchDB Mode.');
}

let rescuerBroadcast = "🚨 RESQROUTE ACTIVE NODE: First responders are currently scanning this sector. Submit your details below.";

// Priority score calculation U = (Headcount * 2) + UrgencyScore + VulnerabilityScore
function calculatePriority(data) {
    let score = (parseInt(data.headcount) || 1) * 2;
    if (data.urgency === 'Critical') score += 10;
    else if (data.urgency === 'High') score += 6;
    else if (data.urgency === 'Moderate') score += 3;
    
    if (Array.isArray(data.vulnerabilities)) {
        if (data.vulnerabilities.includes('Infants')) score += 5;
        if (data.vulnerabilities.includes('Elderly')) score += 4;
        if (data.vulnerabilities.includes('Medical')) score += 5;
    }
    return score;
}

// ==========================================
// RESQROUTE SERVER - PART 2 OF 3
// ==========================================

// API: Submit SOS from Victim Phone -> Save to Database
app.post('/api/sos', async (req, res) => {
    const report = {
        _id: 'SOS-' + Math.floor(1000 + Math.random() * 9000),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        headcount: parseInt(req.body.headcount) || 1,
        urgency: req.body.urgency || 'Moderate',
        vulnerabilities: req.body.vulnerabilities || [],
        needs: req.body.needs || [],
        lat: parseFloat(req.body.lat) || 19.0760,
        lng: parseFloat(req.body.lng) || 72.8777,
        priorityScore: calculatePriority(req.body),
        status: 'PENDING'
    };
    
    try {
        await db.put(report);
        console.log('🚨 SOS SAVED TO DATABASE:', report._id, `(Priority U = ${report.priorityScore})`);
        res.json({ success: true, report });
    } catch(err) {
        console.error('Error saving SOS:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: Fetch Active SOS Reports from Database for Dashboard
app.get('/api/sos', async (req, res) => {
    try {
        const result = await db.allDocs({ include_docs: true });
        let reports = result.rows
            .map(row => row.doc)
            .filter(r => r && r.status !== 'RESCUED');
        
        reports.sort((a, b) => b.priorityScore - a.priorityScore);
        res.json(reports);
    } catch(err) {
        res.json([]);
    }
});

// API: Mark Report as Rescued in Database
app.post('/api/sos/rescue/:id', async (req, res) => {
    try {
        const doc = await db.get(req.params.id);
        doc.status = 'RESCUED';
        await db.put(doc);
        console.log(`✅ REPORT ${req.params.id} MARKED AS RESCUED IN DB`);
        res.json({ success: true });
    } catch(err) {
        res.status(404).json({ success: false });
    }
});

// API: Live Broadcast Messages (Rescuer -> Victims)
app.get('/api/broadcast', (req, res) => {
    res.json({ message: rescuerBroadcast });
});

app.post('/api/broadcast', (req, res) => {
    if (req.body.message) {
        rescuerBroadcast = req.body.message;
        console.log('📢 NEW BROADCAST:', rescuerBroadcast);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
});

// Web Views
app.get('/rescuer', (req, res) => {
    res.sendFile(path.join(__dirname, 'rescuer.html'));
});

app.get('/victim', (req, res) => {
    res.sendFile(path.join(__dirname, 'victim.html'));
});

// ==========================================
// RESQROUTE SERVER - PART 3 OF 3
// ==========================================

// Captive Portal Intercepts for Android, Apple iOS & Windows
const captiveProbes = [
    '/generate_204', '/gen_204', '/hotspot-detect.html',
    '/canonical.html', '/connecttest.txt', '/redirect', '/nwis/blu'
];

app.get(captiveProbes, (req, res) => {
    res.redirect('http://192.168.137.1/victim');
});

app.use((req, res, next) => {
    if (req.path !== '/rescuer' && req.path !== '/victim' && !req.path.startsWith('/api')) {
        return res.redirect('http://192.168.137.1/victim');
    }
    next();
});

const PORT = 80;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`🚀 ResQRoute Server Active!`);
    console.log(`🚑 Rescuer Dashboard : http://localhost/rescuer`);
    console.log(`📱 Victim SOS Portal : http://192.168.137.1/victim`);
    console.log(`💾 Database Storage  : Local PouchDB Folder`);
    console.log(`========================================`);
});

// Add this route to server.js if not already present:
app.get('/api/history', async (req, res) => {
    try {
        const result = await db.allDocs({ include_docs: true });
        let reports = result.rows.map(row => row.doc).filter(r => r && r.status);
        res.json(reports);
    } catch(err) {
        res.json([]);
    }
});