'use strict';
// A multi-client JSONL stream contains records from ALL clients, not only
// the first bot's diagnostic snapshot. Do not claim completeness with
// absent counters, stream errors, or skipped records.
function aggregateRecordings(reports,streamCount){
  const valid=Array.isArray(reports)&&reports.length>=2&&
    reports.every(r=>Number.isSafeInteger(r?.recording?.total)&&
      r.recording.total>=0&&
      Number.isSafeInteger(r.recording.streamErrors)&&
      r.recording.streamErrors>=0);
  const total=valid?reports.reduce((n,r)=>n+r.recording.total,0):null;
  const streamErrors=valid?reports.reduce((n,r)=>n+r.recording.streamErrors,0):null;
  return {total,streamCount,streamErrors,
    complete:valid&&Number.isSafeInteger(streamCount)&&
      streamCount>=0&&total===streamCount&&streamErrors===0};
}
module.exports={aggregateRecordings};
