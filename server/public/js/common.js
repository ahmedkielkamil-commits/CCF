var API = window.location.origin;

function formatQueueTable(entries, containerId) {
    var el = document.getElementById(containerId);
    if (!entries || entries.length === 0) {
        el.innerHTML = '<p>No patients in the live queue.</p>';
        return;
    }

    var html = '<table border="1" cellpadding="6" cellspacing="0">';
    html += '<thead><tr>';
    html += '<th>Position</th><th>Entry ID</th><th>Patient</th><th>Status</th><th>Est. wait</th>';
    html += '</tr></thead><tbody>';

    entries.forEach(function (e) {
        html += '<tr>';
        html += '<td>' + e.position + '</td>';
        html += '<td>' + e.entryid + '</td>';
        html += '<td>' + e.fname + ' ' + e.lname + '</td>';
        html += '<td>' + e.status + '</td>';
        html += '<td>' + e.estimatedWait + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;
}

function loadQueue(callback) {
    return fetch(API + '/api/queue')
        .then(function (r) {
            if (!r.ok) {
                return r.json().then(function (d) {
                    throw new Error(d.error || ('HTTP ' + r.status));
                });
            }
            return r.json();
        })
        .then(callback);
}

function connectQueueSocket(onUpdate) {
    var script = document.createElement('script');
    script.src = API + '/socket.io/socket.io.js';
    script.onerror = function () {
        var status = document.getElementById('socket-status');
        if (status) status.textContent = 'Socket.io script failed to load';
    };
    script.onload = function () {
        var socket = io(API);
        socket.on('queue:update', onUpdate);
        socket.on('connect', function () {
            var status = document.getElementById('socket-status');
            if (status) status.textContent = 'Connected (live updates)';
        });
        socket.on('disconnect', function () {
            var status = document.getElementById('socket-status');
            if (status) status.textContent = 'Disconnected';
        });
    };
    document.head.appendChild(script);
}
