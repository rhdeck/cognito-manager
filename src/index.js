import { CognitoIdentityServiceProvider } from "aws-sdk";
let defaultParams = null;
const setCISPParams = (newParams) => {
  defaultParams = newParams;
};
const getCISP = (params = defaultParams) =>
  new CognitoIdentityServiceProvider(params);
function makePassword() {
  return (
    Array(4)
      .fill("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
      .map(function (x) {
        return x[Math.floor(Math.random() * x.length)];
      })
      .join("") +
    Array(2)
      .fill("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
      .map(function (x) {
        return x[Math.floor(Math.random() * x.length)];
      })
      .join("") +
    Array(2)
      .fill("0123456789")
      .map(function (x) {
        return x[Math.floor(Math.random() * x.length)];
      })
      .join("") +
    Array(2)
      .fill("abcdefghijklmnopqrstuvwxyz")
      .map(function (x) {
        return x[Math.floor(Math.random() * x.length)];
      })
      .join("")
  );
}
function cleanPhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;
  phoneNumber = phoneNumber.replace(/\s/g, "");
  phoneNumber = phoneNumber.replace(/[-()]/g, "");
  if (phoneNumber.length === 10) {
    phoneNumber = "1" + phoneNumber;
  }
  if (!phoneNumber.startsWith("+")) {
    phoneNumber = "+" + phoneNumber;
  }
  return phoneNumber;
}
const validCognitoFilters = [
  "username",
  "email",
  "phone_number",
  "name",
  "given_name",
  "family_name",
  "preferred_username",
  "cognito:user_status", // (called Status in the Console) (case-insensitive)
  "status", // (called Enabled in the Console) (case-sensitive)
  "sub",
];
const standardCognitoAttributes = [
  "address",
  "birthdate",
  "email",
  "family_name",
  "gender",
  "given_name",
  "locale",
  "middle_name",
  "name",
  "nickname",
  "phone_number",
  "picture",
  "preferred_username",
  "profile",
  "updated_at",
  "website",
  "zoneinfo",
];
async function deleteUser(username, userPoolId) {
  if (!username) {
    throw new Error("Cognito username is required");
  }
  const params = {
    UserPoolId: userPoolId,
    Username: username,
  };
  return await getCISP().adminDeleteUser(params).promise();
}
async function findUsersByPhoneNumber(phoneNumber, userPoolId) {
  const goodPhoneNumber = cleanPhoneNumber(phoneNumber);
  const params = {
    UserPoolId: userPoolId,
    Filter: `phone_number="${goodPhoneNumber}"`,
  };
  const { Users = [] } = await getCISP().listUsers(params).promise();
  return Users;
}
async function findUsersByEmail(email, userPoolId) {
  const params = {
    UserPoolId: userPoolId,
    Filter: `email="${email}"`,
  };
  const { Users = [] } = await getCISP().listUsers(params).promise();
  return Users;
}
async function findUsersByPreferredUsername(username, userPoolId) {
  const params = {
    UserPoolId: userPoolId,
    Filter: `preferred_username="${username}"`,
  };
  const { Users = [] } = await getCISP().listUsers(params).promise();
  return Users;
}
class CognitoHandler {
  constructor({ userPoolId, username }) {
    if (!userPoolId) {
      throw new Error("UserPoolId is required");
    }
    this.userPoolId = userPoolId;
    this.username = username;
  }
  async _create(
    {
      email,
      preferredUsername,
      phoneNumber,
      emailVerified,
      phoneVerified,
      username,
      ignoreEmailInvitation,
    },
    userPoolId
  ) {
    if (!userPoolId) userPoolId = this.userPoolId;
    if (!userPoolId) {
      throw new Error("UserPoolId is required");
    }
    let attributes = [];
    const goodPhoneNumber = cleanPhoneNumber(phoneNumber);
    if (!username) {
      throw new Error("A cognito user must be have a username");
    }
    if (!email && !preferredUsername && !goodPhoneNumber) {
      throw new Error(
        "A cognito user must have an email, phoneNumber or preferredUsername"
      );
    }
    const findUsers = [
      goodPhoneNumber && { value: goodPhoneNumber, field: "phone_number" },
      email && { value: email, field: "email" },
      preferredUsername && {
        value: preferredUsername,
        field: "preferred_username",
      },
    ].map((o) => {
      if (!o) return [];
      const { field, value } = o;
      return this.findUsers(field, value);
    });
    const listOfUsers = await Promise.all(findUsers);
    let usersFoundErrors = listOfUsers
      .map((usersArray, i) => {
        const numOfUsers = usersArray.length;
        if (numOfUsers) {
          switch (i) {
            case 0:
              return `Phone number must be unique but found ${numOfUsers} user(s) with phone number`;
            case 1:
              return `Email must be unique but found ${numOfUsers} user(s) with email`;
            case 2:
              return `Preferred username must be unique but found ${numOfUsers} user(s) with preferred username`;
            default:
          }
          return null;
        }
      })
      .filter(Boolean);
    if (usersFoundErrors.length) {
      let errors = ["Failed to create user", ...usersFoundErrors];
      throw new Error(errors.join("\n"));
    }
    if (email && email.length) {
      attributes.push({ Name: "email", Value: email });
      if (emailVerified === true) {
        attributes.push({ Name: "email_verified", Value: "True" });
      }
    }
    if (preferredUsername) {
      attributes.push({
        Name: "preferred_username",
        Value: preferredUsername,
      });
    }
    if (goodPhoneNumber) {
      attributes.push({ Name: "phone_number", Value: goodPhoneNumber });
      if (phoneVerified) {
        attributes.push({ Name: "phone_number_verified", Value: "True" });
      }
    }
    const userObj = {
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: attributes,
    };
    if (ignoreEmailInvitation) {
      userObj.MessageAction = "SUPPRESS";
    }

    const user = await getCISP().adminCreateUser(userObj).promise();
    this.username = userObj.Username;
    this.userPoolId = userPoolId;
    return this;
  }
  async _update(updates) {
    const userAttributes = Object.entries(updates).map(([key, value]) => {
      return {
        Name: key,
        Value: value,
      };
    });
    if (!userAttributes.length) {
      throw new Error("There are no attributes to update");
    }
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserAttributes: userAttributes,
      UserPoolId: this.userPoolId,
      Username: this.username,
    };
    const results = await getCISP().adminUpdateUserAttributes(params).promise();
    return this;
  }
  async get(key, def) {
    //@NOTE: Using getaAll because I did not see
    //a way to get a single attribute from a user
    //in the cidp API
    const attributes = await this.getAll();
    return attributes[key] || def;
  }
  async set(key, value) {
    if (typeof value !== "string") {
      throw new Error(
        "Cognito Attribute values must be type of string but received " +
          typeof value
      );
    }
    if (
      !standardCognitoAttributes.includes(key) &&
      !key.startsWith("custom:")
    ) {
      throw new Error(
        `Custom Attributes must be prepended with "custom:". E.g. custom:${key}`
      );
    }
    return this._update({ [key]: value });
  }
  async getAll() {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
    };
    const user = await getCISP().adminGetUser(params).promise();
    const { UserAttributes = [] } = user || {};
    const attributes = UserAttributes.reduce((acc, { Name, Value }) => {
      acc[Name] = Value;
      return acc;
    }, {});
    return attributes;
  }
  async setPermanentPassword(newPassword) {
    return this.setPassword(newPassword, true);
  }
  async setTemporaryPassword(newPassword) {
    return this.setPassword(newPassword, false);
  }
  async setPassword(newPassword, isPermanentPassword) {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
      Permanent: isPermanentPassword,
      Password: newPassword || makePassword(),
    };
    await this.globalSignOut();
    await getCISP().adminSetUserPassword(params).promise();
    return params.Password;
  }
  async addFederatedAuth() {}
  async enableMFA() {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
      SMSMfaSettings: { Enabled: true, PreferredMFA: true },
    };
    await getCISP().adminSetUserMFAPreference(params).promise();
  }
  async disableMFA() {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
      SMSMfaSettings: { Enabled: false },
    };
    await getCISP().adminSetUserMFAPreference(params).promise();
  }
  async enable() {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
    };

    await getCISP().adminEnableUser(params).promise();
    return true;
  }
  async disable() {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
    };

    await this.globalSignOut();
    await getCISP().adminDisableUser(params).promise();
  }
  async globalSignOut() {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
    };
    await getCISP().adminUserGlobalSignOut(params).promise();
  }
  async findUsers(key, value, startsWith = false) {
    if (!validCognitoFilters.includes(key)) {
      throw new Error(
        "Invlaid key. Supported filters are ",
        validCognitoFilters.join(", ")
      );
    }
    const params = {
      UserPoolId: this.userPoolId,
      Filter: `${key}${startsWith ? "^=" : "="}"${value}"`,
    };
    const { Users = [] } = await getCISP().listUsers(params).promise();
    return Users;
  }
  async delete(username) {
    if (!username) username = this.username;
    if (!username) {
      throw new Error("Cognito username is required");
    }
    const params = {
      UserPoolId: this.userPoolId,
      Username: username,
    };
    await getCISP().adminDeleteUser(params).promise();
    return this;
  }
}

export {
  CognitoHandler,
  deleteUser,
  findUsersByEmail,
  findUsersByPhoneNumber,
  findUsersByPreferredUsername,
  setCISPParams,
};
