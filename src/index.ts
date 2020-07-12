import { CognitoIdentityServiceProvider } from "aws-sdk";
let defaultParams: CognitoIdentityServiceProvider.ClientConfiguration;

const setCISPParams = (
  newParams?: CognitoIdentityServiceProvider.ClientConfiguration
) => {
  defaultParams = newParams;
};
const getCISP = (
  params: CognitoIdentityServiceProvider.ClientConfiguration = defaultParams
) => new CognitoIdentityServiceProvider(params);
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
function cleanPhoneNumber(phoneNumber: string) {
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
type cognitoFilter =
  | "username"
  | "email"
  | "phone_number"
  | "name"
  | "given_name"
  | "family_name"
  | "preferred_username"
  | "cognito:user_status" // (called Status in the Console) (case-insensitive)
  | "status" // (called Enabled in the Console) (case-sensitive)
  | "sub";
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
async function deleteUser(username: string, userPoolId: string) {
  const params = {
    UserPoolId: userPoolId,
    Username: username,
  };
  await getCISP().adminDeleteUser(params).promise();
}
async function findUsersByPhoneNumber(phoneNumber: string, userPoolId: string) {
  const goodPhoneNumber = cleanPhoneNumber(phoneNumber);
  const params = {
    UserPoolId: userPoolId,
    Filter: `phone_number="${goodPhoneNumber}"`,
  };
  const { Users = [] } = await getCISP().listUsers(params).promise();
  return Users;
}
async function findUsersByEmail(email: string, userPoolId: string) {
  const params = {
    UserPoolId: userPoolId,
    Filter: `email="${email}"`,
  };
  const { Users = [] } = await getCISP().listUsers(params).promise();
  return Users;
}
async function findUsersByPreferredUsername(
  username: string,
  userPoolId: string
) {
  const params = {
    UserPoolId: userPoolId,
    Filter: `preferred_username="${username}"`,
  };
  const { Users = [] } = await getCISP().listUsers(params).promise();
  return Users;
}
class CognitoHandler {
  protected username: string;
  protected userPoolId: string;
  constructor({
    userPoolId,
    username,
  }: {
    userPoolId: string;
    username: string;
  }) {
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
      emailVerified = false,
      phoneVerified = false,
      username,
      ignoreEmailInvitation = false,
    }: {
      email?: string;
      preferredUsername?: string;
      phoneNumber?: string;
      emailVerified: boolean;
      phoneVerified: boolean;
      username: string;
      ignoreEmailInvitation: boolean;
    },
    userPoolId?: string
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
      goodPhoneNumber && {
        value: goodPhoneNumber,
        field: <cognitoFilter>"phone_number",
      },
      email && { value: email, field: <cognitoFilter>"email" },
      preferredUsername && {
        value: preferredUsername,
        field: <cognitoFilter>"preferred_username",
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
    const userObj: CognitoIdentityServiceProvider.AdminCreateUserRequest = {
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
  async _update(updates: { [key: string]: string }) {
    const userAttributes: CognitoIdentityServiceProvider.AttributeListType = Object.entries(
      updates
    ).map(([key, value]) => {
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
    const params: CognitoIdentityServiceProvider.AdminUpdateUserAttributesRequest = {
      UserAttributes: userAttributes,
      UserPoolId: this.userPoolId,
      Username: this.username,
    };
    const results = await getCISP().adminUpdateUserAttributes(params).promise();
    return this;
  }
  async get(key: string, def?: string): Promise<string | undefined> {
    //@NOTE: Using getaAll because I did not see
    //a way to get a single attribute from a user
    //in the cidp API
    const attributes = await this.getAll();
    return attributes[key] || def;
  }
  async set(key: string, value: string) {
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
  async getAll(): Promise<{ [key: string]: string }> {
    if (!this.username) {
      throw new Error("Cognito username is required");
    }
    try {
      const params = {
        UserPoolId: this.userPoolId,
        Username: this.username,
      };
      const user = await getCISP().adminGetUser(params).promise();
      const { UserAttributes = [] } = user || {};
      const attributes = UserAttributes.reduce((acc, { Name, Value }) => {
        acc[Name] = Value;
        return acc;
      }, <{ [key: string]: string }>{});
      return attributes;
    } catch (e) {
      throw e;
    }
  }
  async setPermanentPassword(newPassword: string) {
    return this.setPassword(newPassword, true);
  }
  async setTemporaryPassword(newPassword: string) {
    return this.setPassword(newPassword, false);
  }
  async setPassword(
    newPassword: string,
    isPermanentPassword: boolean
  ): Promise<void> {
    const params: CognitoIdentityServiceProvider.AdminSetUserPasswordRequest = {
      UserPoolId: this.userPoolId,
      Username: this.username,
      Permanent: isPermanentPassword,
      Password: newPassword || makePassword(),
    };
    await this.globalSignOut();
    await getCISP().adminSetUserPassword(params).promise();
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
    const params = {
      UserPoolId: this.userPoolId,
      Username: this.username,
    };
    await getCISP().adminUserGlobalSignOut(params).promise();
  }
  async findUsers(key: cognitoFilter, value: string, startsWith = false) {
    const params = {
      UserPoolId: this.userPoolId,
      Filter: `${key}${startsWith ? "^=" : "="}"${value}"`,
    };
    const { Users = [] } = await getCISP().listUsers(params).promise();
    return Users;
  }
  async delete(username: string = this.username) {
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
