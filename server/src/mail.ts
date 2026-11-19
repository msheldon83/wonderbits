/**
 * Mail to grown-ups. Only ever plain text, and only ever to a parent: the
 * server holds no address for a child.
 */
import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Development: the mail is printed where the server runs, so a sign-in link can be copied from the log. */
export const consoleMailer: Mailer = {
  async send(mail) {
    console.log(`--- mail to ${mail.to}: ${mail.subject}\n${mail.text}\n---`);
  },
};

export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/** Tests: keeps what was sent. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}
