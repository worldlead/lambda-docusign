
const docusign = require('docusign-esign');
const fs = require('fs');
const jwtConfig = require('./jwtConfig.json');

const SCOPES = [
    "signature", "impersonation"
];

exports.handler = async (event) => {
  
  const headers = event.headers;
  const requestBody = JSON.parse(event.body); 
  
  function getConsent() {
    var urlScopes = SCOPES.join('+');
  
    // Construct consent URL
    var redirectUri = "https://developers.docusign.com/platform/auth/consent";
    var consentUrl = `${jwtConfig.dsOauthServer}/oauth/auth?response_type=code&` +
                        `scope=${urlScopes}&client_id=${jwtConfig.dsJWTClientId}&` +
                        `redirect_uri=${redirectUri}`;
  
    console.log("Open the following URL in your browser to grant consent to the application:");
    console.log(consentUrl);
    console.log("Consent granted? \n 1)Yes \n 2)No");
    let consentGranted = prompt("");
    if(consentGranted == "1"){
      return true;
    } else {
      console.error("Please grant consent!");
      process.exit();
    }
  }
  
  async function authenticate() {
    const jwtLifeSec = 10 * 60, // requested lifetime for the JWT is 10 min
    dsApi = new docusign.ApiClient();
    dsApi.setOAuthBasePath(jwtConfig.dsOauthServer.replace("https://", "")); // it should be domain only.
    let rsaKey = fs.readFileSync(jwtConfig.privateKeyLocation);
  
    try {
      const results = await dsApi.requestJWTUserToken(
        jwtConfig.dsJWTClientId,
        jwtConfig.impersonatedUserGuid,
        SCOPES,
        rsaKey,
        jwtLifeSec
      );
      const accessToken = results.body.access_token;
  
      // get user info
      const userInfoResults = await dsApi.getUserInfo(accessToken);
  
      // use the default account
      let userInfo = userInfoResults.accounts.find(
        (account) => account.isDefault === "true"
      );
  
      return {
        accessToken: results.body.access_token,
        apiAccountId: userInfo.accountId,
        basePath: `${userInfo.baseUri}/restapi`,
      };
    } catch (e) {
      console.log(e);
      let body = e.response && e.response.body;
      // Determine the source of the error
      if (body) {
        // The user needs to grant consent
        if (body.error && body.error === "consent_required") {
          if (getConsent()) {
            return authenticate();
          }
        } else {
          // Consent has been granted. Show status code for DocuSign API error
          this._debug_log(`\nAPI problem: Status code ${
            e.response.status
          }, message body:
            ${JSON.stringify(body, null, 4)}\n\n`);
        }
      }
    }
  }
  
  function getArgs(apiAccountId, accessToken, basePath){
    
    const signer1_Email = requestBody.signer1_Email;
    const signer1_Name = requestBody.signer1_Name;
    const signer2_Email = requestBody.signer2_Email;
    const signer2_Name = requestBody.signer2_Name;
    const ccEmail = requestBody.ccEmail;
    const ccName = requestBody.ccName;
    const templateId = requestBody.templateId;
    const title = requestBody.title;
    
    const envelopeArgs = {
      signer1_Email: signer1_Email,
      signer1_Name: signer1_Name,
      signer2_Email: signer2_Email,
      signer2_Name: signer2_Name,
      
      ccEmail: ccEmail,
      ccName: ccName,
      status: "sent",
      title: title,
      templateId: templateId
    };
    const args = {
      accessToken: accessToken,
      basePath: basePath,
      accountId: apiAccountId,
      envelopeArgs: envelopeArgs
    };
  
    return args;
  }
  
  function makeEnvelope(args) {
    // Create the envelope definition
    let env = new docusign.EnvelopeDefinition();
    env.emailSubject = "Please sign this contract";
    env.templateId = args.templateId;
    
    let text1 = docusign.Text.constructFromObject({
      tabLabel: "title",
      value: args.title,
    });
     
    // Pull together the existing and new tabs in a Tabs object:
    let tabs = docusign.Tabs.constructFromObject({
      // checkboxTabs: [check1, check3], // numberTabs: [number1],
      // radioGroupTabs: [radioGroup],
      textTabs: [text1],
      // listTabs: [list1],
    });
  
    let signer1 = docusign.TemplateRole.constructFromObject({
      email: args.signer1_Email,
      name: args.signer1_Name,
      roleName: "signer1",
      tabs: tabs
    });
    let signer2 = docusign.TemplateRole.constructFromObject({
      email: args.signer2_Email,
      name: args.signer2_Name,
      roleName: "signer2",
      
    });
    // Create a cc template role.
    // We're setting the parameters via setters
    let cc1 = new docusign.TemplateRole();
    cc1.email = args.ccEmail;
    cc1.name = args.ccName;
    cc1.roleName = "cc";
  
    // Add the TemplateRole objects to the envelope object
    env.templateRoles = [signer1, signer2, cc1];
    env.status = args.status; // We want the envelope to be sent
    return env;
  }
  
  const sendEnvelope = async (args) => {
    // Data for this method
    // args.basePath
    // args.accessToken
    // args.accountId
  
    let dsApiClient = new docusign.ApiClient();
    dsApiClient.setBasePath(args.basePath);
    dsApiClient.addDefaultHeader("Authorization", "Bearer " + args.accessToken);
    let envelopesApi = new docusign.EnvelopesApi(dsApiClient),
      results = null;
  
    // Step 1. Make the envelope request body
    let envelope = makeEnvelope(args.envelopeArgs);
  
    // Step 2. call Envelopes::create API method
    // Exceptions will be caught by the calling function
    results = await envelopesApi.createEnvelope(args.accountId, {
      envelopeDefinition: envelope,
    });
    let envelopeId = results.envelopeId;
  
    console.log(`Envelope was created. EnvelopeId ${envelopeId}`);
    return { envelopeId: envelopeId };
  };
  
  async function main(){
    let accountInfo = await authenticate();
    let args = getArgs(accountInfo.apiAccountId, accountInfo.accessToken, accountInfo.basePath);
    let envelopeId = await sendEnvelope(args);
    return envelopeId;
    
  }
  
  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(await main()),
  };
    
  return response;
  
}

