/* RAW V5.15 — auth-aware sidebar and account view.
 * Presentation only: never grants permissions or changes Firebase auth.
 * Uses textContent exclusively for untrusted account fields.
 */
(function(global){
"use strict";
function apply(documentRef,{authenticated=false,email="",creditsLabel="",verifiedOwner=false}={}){
 if(!documentRef?.getElementById)return false;
 const loggedIn=authenticated===true;
 const login=documentRef.getElementById("loginNav");
 const account=documentRef.getElementById("accountNav");
 const accountScreen=documentRef.getElementById("account");
 if(login)login.hidden=loggedIn;
 if(account)account.hidden=!loggedIn;
 if(accountScreen)accountScreen.hidden=!loggedIn;
 const mail=documentRef.getElementById("rawAccountEmail");
 if(mail)mail.textContent=loggedIn?String(email||"—").slice(0,150):"—";
 const credits=documentRef.getElementById("rawAccountCredits");
 if(credits)credits.textContent=loggedIn?String(creditsLabel||"—").slice(0,100):
  "Nema aktivne prijave";
 const status=documentRef.getElementById("rawAccountAccessStatus");
 if(status)status.textContent=!loggedIn?"SIGNED OUT":
   verifiedOwner===true?"VERIFIED OWNER · LOCAL TEST":"PRIJAVLJEN";
 return true;
}
global.RAWAuthNavigationV515=Object.freeze({apply});
})(typeof window!=="undefined"?window:globalThis);
