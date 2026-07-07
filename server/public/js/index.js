(function () {
    var API = window.location.origin;
    var timer = null;

    function patient(row) {
        return ((row.fname || '') + ' ' + (row.lname || '')).trim() || '—';
    }

    function queueTable(rows) {
        if (!rows.length) return '<p><em>(empty)</em></p>';
        var html = '<table border="1" cellpadding="6" cellspacing="0" width="100%">';
        html += '<thead><tr><th>Position</th><th>Entry ID</th><th>Patient</th><th>Status</th></tr></thead><tbody>';
        rows.forEach(function (r) {
            html += '<tr><td>' + r.position + '</td><td>' + r.entryid + '</td><td>' +
                patient(r) + '</td><td>' + r.status + '</td></tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    function renderSync(data) {
        document.getElementById('sync-status').textContent = data.live.inSync
            ? 'IN SYNC (' + data.checkedAt + ')'
            : 'OUT OF SYNC — ' + data.live.mismatchCount + ' issue(s) (' + data.checkedAt + ')';
        document.getElementById('mysql-table').innerHTML = queueTable(data.mysql.live);
        document.getElementById('redis-table').innerHTML = queueTable(data.redis.live);
    }

    function loadSync() {
        return fetch(API + '/api/sync')
            .then(function (r) {
                if (!r.ok) {
                    return r.json().then(function (d) {
                        throw new Error(d.error || ('HTTP ' + r.status));
                    });
                }
                return r.json();
            })
            .then(renderSync)
            .catch(function (e) {
                document.getElementById('sync-status').textContent = 'Error: ' + e.message;
            });
    }

    function schedule() {
        if (timer) clearInterval(timer);
        if (document.getElementById('auto-refresh').checked) {
            timer = setInterval(loadSync, 5000);
        }
    }

    if (!window.location.protocol.startsWith('http')) {
        document.getElementById('health').textContent =
            'Open via http://localhost:8080/ (not as a local file).';
        return;
    }

    fetch(API + '/health')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            document.getElementById('health').textContent =
                d.ok ? 'Server is up at ' + API : 'Unexpected response';
        })
        .catch(function (e) {
            document.getElementById('health').textContent =
                'Cannot reach server — ' + e.message;
        });

    document.getElementById('btn-refresh').addEventListener('click', loadSync);
    document.getElementById('auto-refresh').addEventListener('change', schedule);

    loadSync();
    schedule();
})();
