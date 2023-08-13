require('dotenv').config();
const axios = require('axios');

const getEnvelopId = async() => {

    // Create request headers including AWS GATEWAT API KEY
    // const headers = {
    //     'Content-Type': 'application/json',
    //     "x-api-key": process.env.AWS_GATEWAY_API_KEY
    // }
    const headers = {
        'Content-Type': 'application/json',
        "x-api-key": "vVzRyIyAHW6IhYK4s1RPb177zeRlNUK68LWfs43c"
    }
    
    const body =  {
        "signer1_Email":"procosep@gmail.com",
        "signer1_Name":"Marcos Oliveria",
        "signer2_Email":"procosep@gmail.com",
        "signer2_Name":"Kenn Palm",
        "ccEmail":"procosep@gmail.com",
        "ccName":"Good Dev",
        "title": "NiteTrain Coach Driver Compensation Guidelines",
        "templateId": "862eaaef-314c-4ee4-b4ff-6534887e31c6"
    }
    
    // Make post request to the endpoint of AWS GATEWAY API which will trigger the lambda function, which will then integrate Docusign API.
    // const api_query = "https://rr1miu5snd.execute-api.eu-north-1.amazonaws.com/default/api-lambda-docusign";
    const api_query = "https://b74pq52uk0.execute-api.eu-north-1.amazonaws.com/default/template_crud";
    const res = await axios.get(api_query, { headers: headers });
    const data = res.data;
    console.log(data);
    return data;
}

getEnvelopId();
