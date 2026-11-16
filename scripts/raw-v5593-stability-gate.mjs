// V5.59.3 stable-state gate: a transient MATCH is never sufficient.
// This gate accepts only the final consecutive observation after quiet interval;
// it does NOT claim that a host event can be proven to have been caused by our send.
export function makeStableGate({quietMs=900,minAfterSendMs=1400}={}){
 if(!Number.isFinite(quietMs)||quietMs<200||!Number.isFinite(minAfterSendMs)||minAfterSendMs<quietMs)throw Error("INVALID_STABLE_GATE");
 let sentAt=null,lastAt=null,observations=0;
 return {
  arm(at){if(!Number.isFinite(at))throw Error("INVALID_SEND_TIME");sentAt=at;lastAt=null;observations=0},
  observe(at){if(sentAt===null||!Number.isFinite(at)||at<sentAt)throw Error("INVALID_OBSERVATION_TIME");lastAt=at;observations++},
  inspect(at,status){
   if(sentAt===null)return {ready:false,reason:"NOT_ARMED"};
   if(observations===0)return {ready:false,reason:"NO_POST_SEND_VALUE"};
   if(at-sentAt<minAfterSendMs)return {ready:false,reason:"MINIMUM_OBSERVATION_WINDOW"};
   if(at-lastAt<quietMs)return {ready:false,reason:"WAITING_FOR_STABLE_QUIET"};
   if(!["MATCH","MISMATCH"].includes(status))return {ready:false,reason:"INCOMPLETE_PAIR"};
   return {ready:true,status,observationCount:observations,quietForMs:at-lastAt,elapsedMs:at-sentAt};
  }
 };
}
