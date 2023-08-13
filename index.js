
const docusign = require('docusign-esign');
const fs = require('fs');
const axios = require('axios');
const jwtConfig = require('./jwtConfig.json');

const SCOPES = [
    "signature", "impersonation"
];

exports.handler = async (event) => {
  
  const httpMethod = event.httpMethod;
  const path = event.path;
  const headers = event.headers;
  const params = event.queryStringParameters;
  const requestBody = JSON.parse(event.body); 
  
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
  
  // Use SDK to get the list of templates
  async function getTemplateList(args) {
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(args.basePath);
    apiClient.addDefaultHeader("Authorization", "Bearer " + args.accessToken);

    const templatesApi = new docusign.TemplatesApi(apiClient);
    const templates = await templatesApi.listTemplates(args.apiAccountId);
    return templates;
  }
  
  // Use Rest api to get list of templates
async function getListOfTemplates(args) {
  let baseURL = `${args.basePath}/v2.1/accounts/${args.apiAccountId}/templates`;
  try {
    const response = await axios.get(baseURL, {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
    });

    //   console.log('List of templates:', response.data);
    return response.data;
  } catch (error) {
    console.error("Error getting templates:", error.message);
  }
}

// Get Template Documents
async function getTemplateDocuments(args, templateId) {
  let baseURL = `${args.basePath}/v2.1/accounts/${args.apiAccountId}/templates/${templateId}/documents`;
  try {
    const response = await axios.get(
      baseURL,
      {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
        },
      }
    );
    // console.log(response.data);
    return response.data;
  } catch (error) {
    console.error("Error deleting template:", error.message);
  }
}

// Delete the documents of a Template
async function deleteDocuments(args, templateId, documentIds) {
    const url = `${args.basePath}/v2.1/accounts/${args.apiAccountId}/templates/${templateId}/documents`;
    const headers = {
      'Authorization': `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json'
    };
    const data = {
      documents: documentIds.map(documentId => ({ documentId }))
    };
  
    try {
      const response = await axios.delete(url, { headers, data });
      // console.log('Documents deleted successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error deleting documents:', error.response.data);
    }
}

// Delete template
async function deleteTemplate(args, templateId) {
  const url = `${args.basePath}/v2.1/accounts/${args.apiAccountId}/templates/${templateId}`;
  const headers = {
    'Authorization': `Bearer ${args.accessToken}`,
    'Content-Type': 'application/json'
  };
  const response = await axios.get(url, {headers:headers});
  const documents = response.data.documents;
  const documentIds = documents.map(({documentId}) => documentId);
  const result = await deleteDocuments(args, templateId, documentIds);
  return "Removed documents of Template successfully!";
}

//Copy a template
async function copyTemplate(args, templateId, newName) {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(args.basePath);
  apiClient.addDefaultHeader('Authorization', 'Bearer ' + args.accessToken);
  const templatesApi = new docusign.TemplatesApi(apiClient);

  try {
      // Step 1: Get the original template
      const originalTemplate = await templatesApi.get(args.apiAccountId, templateId);
      // console.log(originalTemplate);
      // Step 2: Create a new template with the copied components
      let newTemplate = {...originalTemplate};
      newTemplate.name = newName;
      newTemplate.status = "created";
      
      const response = await templatesApi.createTemplate(args.apiAccountId, {
          envelopeTemplate: newTemplate,
      });
      // console.log('Template copied successfully:', response);
      return response;
    } catch (error) {
      console.error('Error copying template:', error);
    }
}


async function main(){
  let accountInfo = await authenticate();
  
  if (httpMethod === "GET") {
    let templates = await getListOfTemplates(accountInfo);
    return templates;
  }
  
  if (requestBody.action === "copy") {
    let response = await copyTemplate(accountInfo, requestBody.templateId, requestBody.newName);
    return response;
  }
  
  if (requestBody.action === "delete") {
    let response = await deleteTemplate(accountInfo, requestBody.templateId);
    return response;
  }
  
  
  if (requestBody.action === "contract") {
    let args = getArgs(accountInfo.apiAccountId, accountInfo.accessToken, accountInfo.basePath);
    let envelopeId = await sendEnvelope(args);
    return envelopeId;
  }
  
  
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

