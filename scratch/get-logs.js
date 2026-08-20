const https = require('https');

const repo = 'aarushkumaar/azzura';
const runId = '31694214933';

https.get({
  hostname: 'api.github.com',
  path: `/repos/${repo}/actions/runs/${runId}/jobs`,
  headers: { 'User-Agent': 'Node.js' }
}, (res) => {
  let jobData = '';
  res.on('data', chunk => jobData += chunk);
  res.on('end', () => {
    const jobs = JSON.parse(jobData).jobs;
    const failedJob = jobs.find(j => j.conclusion === 'failure');
    if (!failedJob) return console.log('No failed job found.');
    console.log(`Failed job: ${failedJob.name}`);
    
    https.get({
      hostname: 'api.github.com',
      path: `/repos/${repo}/actions/jobs/${failedJob.id}/logs`,
      headers: { 'User-Agent': 'Node.js' }
    }, (res) => {
      if (res.statusCode === 302) {
        https.get(res.headers.location, (logRes) => {
          let logText = '';
          logRes.on('data', chunk => logText += chunk);
          logRes.on('end', () => {
            const lines = logText.split('\n');
            console.log(lines.slice(-30).join('\n'));
          });
        });
      }
    });
  });
});
