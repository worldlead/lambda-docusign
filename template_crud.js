const docusign = require("docusign-esign");
const fs = require("fs");
const axios = require("axios");
const jwtConfig = require("./jwtConfig.json");

const SCOPES = ["signature", "impersonation"];

exports.handler = async (event) => {


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

  // Use SDK
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
  // Delete the template
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
    console.log(result);
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
          console.log('Template copied successfully:', response);
        } catch (error) {
          console.error('Error copying template:', error);
        }
  }


  async function main() {
    let args = await authenticate();
  // const result = await getTemplateDocuments(args, templateId);
  // await deleteTemplate(args, templateId);
  // console.log(result); 
  // const newName = "template5";
  // await copyTemplate(args, templateId, newName);
  }
  main();

}
