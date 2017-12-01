# Setup a local, on premises environment to run lambda like microservice functions on a kubernetes cluster

> This repository houses a few example applications to run on a kubernetes cluster in the traditional containerized method and functions to run as microservices in a kubernetes "serverless" environment.  This README file walks a user through the steps of setting up the Kubernetes cluster and deploying the applications.

## Prefatory Matters
This tutorial was done on MacOS High Sierra using Vagrant for machine virtualization.  Most of the important aspects are accomplished inside the Vagrant VMs running CentOS 7, so there reason this couldn't work on Windows or Linux.

## What You'll Accomplish
1. Using Vagrant, you'll setup three CentOS7 virtual machines that will act as a master and two minions of a virtual Kubernetes (K8) cluster running on a single machine.  
2. Using those VMs, manually create and configure a Kubernetes cluster.  Install an ingress controller to control access to the services running on the cluster.
3. Install a serverless framework to transform your Kubernetes cluster into an AWS Lambda-like serverless platform.
4. Deploy Node.js and Python applications to the cluster running as traditional containerized applications and lambda functions.

## Goal
When complete, you'll be able to create a serverless envrionment capable of running lambda functions without the overhead of managing the containerization of those functions.

## Walkthrough
1. [Environment and VM Setup](#environment-and-vm-setup)
2. [Kubernetes Installation and Configuration](#kubernetes-installation-and-configuration)
3. [Setup Host Machine to Control Cluster](#setup-host-machine-to-control-cluster)
4. [Running Containerized Applications](#running-containerized-applications)
5. [Fission Installation and Configuration](#fission-installation-and-configuration)
6. [Kanali Installation and Configuration](#kanali-installation-and-configuration)
7. [Running Serverless Functions](#running-serverless-Functions)

# Environment and VM Setup
### Install Brew
```
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

### Install Vagrant and Dependencies
```
brew cask install virtualbox
brew cask install vagrant
brew cask install vagrant-manager
brew cask install wget
```

### Clone this Repository
```
cd ~/Documents
mkdir serverless-on-kubernetes && cd serverless-on-kubernetes
git clone https://github.com/Ulls/serverless-on-kubernetes.git
```
(If you need to install git, instructions are [here](https://www.atlassian.com/git/tutorials/install-git#mac-os-x).)

### Configure the CentOS VMs
```
cd ~/Documents/serverless-on-kubernetes
mkdir master && cd master
vagrant init centos/7
```

Edit the Vagrantfile to allow insecure mode for downloading the box (cert issue at the host) and for the creation of a private IP address for the VM.  The Vagrantfile should look like this:
```
Vagrant.configure("2") do |config|
  config.vm.box = "centos/7"
  config.vm.box_download_insecure = true
  config.vm.network "private_network", type: "dhcp"
end
```

### Create the VM by running Vagrant's 'up' command
```
vagrant up
```
There is a chance you might run into the dreaded Vagrant error stating it can't provision an IP address.  If that's the case add a random IP address to your config.vm.network line: `config.vm.network "private_network", type: "dhcp", ip: "10.0.0.8"`

Repeat these configuration steps starting at "Configure the CentOS VMs" to create the minions.  Simply replace "master" with "minion1" and then repeat again with "minion2".

### SSH into your VMs and edit the host files so they can communicate.
```
cd ~/Documents/serverless-on-kubernetes/master
vagrant ssh
sudo su
ip address show
```

Copy the IP address on the eth1.  Do this for all your VMs and your host machine.  Edit the each VMs /etc/hosts files and enter so that you can reference these machines by name.
`vi /etc/hosts` and add...
```
<IP of master>    master
<IP of minion1>   minion1
<IP of minion2>   minion2
```
You should now have 3 Vagrant VMs (master, minion1 and minion2) running on your host mahcine.  The 3 VMs and the host machine should be able to resolve each other by name having added the entries to the `/etc/hosts` file.

# Kubernetes Installation and Configuration
### Install helper software and disable selinux
The following steps will apply to both the master and two minions.  It will be noted where there are differences.  In a Kubernetes cluster, the master and the minions require different software installed and configured.  This walkthrough will differentiate those for you.

Let's start with the master.  Access your VMs by issuing the following commands.

```
cd ~/Documents/serverless-on-kubernetes/master
vagrant ssh
```
At this point you're now inside your VM where you'll install helper software packages and disable selinux.
```
sudo su
yum install -y wget
yum install -y ntp
yum install -y etcd
yum install -y net-tools
```
ntp and etcd are essential to Kubernetes.  We'll run those later on.  Time to disable selinux...

`vi /etc/sysconfig/selinux`... edit this file like so:
~~~~~
#SELINUX=enabled
SELINUX=disabled
~~~~~
*If you're not familiar with the vi editor, use an editor of you choice otherwise here are a few commands you should know...*
> i: Input mode (allows you to add text)
> esc: Leaves input mode
> shift-ZZ: Saves the file and exits (when not in input mode)

Now reboot to assure selinux is off...
```
reboot
```
You're now back outside your VM.  It'll come back up in about a minute.  When it does, ssh back into the box and check the status of selinux.
```
vagrant ssh
sudo su
sestatus
```
If sestatus reports "disabled", move on.

# Setup Host Machine to Control Cluster

### Install and configure kubectl

Next install kubectl, a command line interface tool that is able to communicate and control the kubernetes cluster you just created.  For this exercise you'll install kubectl on all three machines.  Because your VMs are running CentOS7 and your host machine is (likely) a Mac, the installation instructions are a bit different.
##### Install kubectl on the host machine
```
sudo su
cd /tmp
curl -LO https://storage.googleapis.com/kubernetes-release/release/`curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt`/bin/darwin/amd64/kubectl
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin/kubectl
```
##### Install kubectl on the 3 VMs
```
sudo su
cd /tmp
curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl
chmod +x ./kubectl
sudo mv ./kubectl /usr/bin/kubectl
```
We'll be using this tool extensively throughout this exercise.

### Install and configure Kubernetes

The following steps are done inside of your VMs, so `cd` to each directory and repeat these steps for each, keeping in mind the differences between the master and the minions.  Again, `vagrant ssh` to access the VM's command line.  Then, perform the following steps...
```
mkdir /etc/kubernetes
cd /tmp
wget https://github.com/kubernetes/kubernetes/releases/download/v1.8.3/kubernetes.tar.gz
tar -zvxf kubernetes.tar.gz -C .
```
The binaries aren’t included, so they need to be downloaded and extracted…
```
cd /tmp/kubernetes/cluster
./get-kube-binaries.sh
cd ../server
tar -zvxf kubernetes-server-linux-amd64.tar.gz -C .
```
Set you cluster name…
```
# echo "export CLUSTER_NAME=mykubecluster" >> /etc/environment
# exit
# exit
$ vagrant ssh
# sudo su
# echo $CLUSTER_NAME
(YOU SHOULD SEE 'mykubecluster')
```
Copy the binaries to the bin directory...
```
cd /tmp/kubernetes/server/kubernetes/server/bin &&
cp kube-apiserver /usr/bin &&
cp kube-controller-manager /usr/bin &&
cp kube-proxy /usr/bin &&
cp kube-scheduler /usr/bin &&
cp kubelet /usr/bin &&
mkdir /var/lib/kubelet
```
Start ntp...

`systemctl enable ntpd && systemctl start ntpd`

If you're on a minion, you're going to need to install docker...

`yum install -y docker`

### Securing the Kubernetes cluster

We're going to create a top level domain for our cluster (internally), a CA to create certificates for each node (master and minion) in the cluster and the certificates themselves.  We're going to run these command on the master node to take advantage of some of the benefits of CentOS7.

Access the master node `cd ~/Documents/serverless/master && vagrant ssh` and become root `sudo su`.  The first thing we'll do is create the CA we'll use to generate the certs for our cluster...
```
mkdir /srv/kubernetes
openssl genrsa -out /srv/kubernetes/ca.key 4096
openssl req -x509 -new -nodes -key /srv/kubernetes/ca.key -subj "/CN=master" -days 10000 -out /srv/kubernetes/ca.crt
```
Now let's create our server's key, certificate signing request and certificate...
```
openssl genrsa -out /srv/kubernetes/server.key 2048
openssl req -new -key /srv/kubernetes/server.key -subj "/CN=master" -out /srv/kubernetes/server.csr
openssl x509 -req -in /srv/kubernetes/server.csr -CA /srv/kubernetes/ca.crt -CAkey /srv/kubernetes/ca.key -CAcreateserial -out /srv/kubernetes/server.crt -days 10000
```
Now, we need a token that can be used for authenticating to the master's resources.  Just throw something into an environment variable for now...
```
TOKEN=$(dd if=/dev/urandom bs=128 count=1 2>/dev/null | base64 | tr -d "=+/" | dd bs=32 count=1 2>/dev/null)
```
Save that token in a file that can be referenced by the Kubernetes API server...
```
mkdir /srv/kube-apiserver
echo "${TOKEN},kubelet,kubelet" > /srv/kube-apiserver/known_tokens.csv
```
Let's generate certificates for our 2 minions and 1 master machine.  Set an environment variable with the names of the machines...
```
NODES="master minion1 minion2"
```
Now run the following command to generate the client certificates you'll need for each machine...
```
for NODE in $NODES; do
    openssl req -newkey rsa:2048 -nodes -keyout /srv/kubernetes/${NODE}.key -subj "/CN=${NODE}" -out /srv/kubernetes/${NODE}.csr
      openssl x509 -req -days 10000 -in /srv/kubernetes/${NODE}.csr -CA /srv/kubernetes/ca.crt -CAkey /srv/kubernetes/ca.key -CAcreateserial -out /srv/kubernetes/${NODE}.crt
  done
```
If you run `ls /srv/kubernetes` you should see the following files listed there...
```
ca.crt  ca.key  ca.srl  master.crt  master.csr  master.key  minion1.crt  minion1.csr  minion1.key minion2.crt  minion2.csr  minion2.key server.crt  server.csr  server.key
```
At this point you should have all the certificate files you need to secure your cluster.

[more info](https://kubernetes.io/docs/concepts/cluster-administration/certificates/)

### Setup Minion (Node) Security

openssl genrsa -out 172.28.128.9.key 4096
openssl req -new -key 172.28.128.9.key -subj "/CN=172.28.128.9" -out 172.28.128.9.csr
openssl x509 -req -days 10000 -in 172.28.128.9.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out 172.28.128.9.crt -sha256

mkdir -p /srv2/kubernetes
cp *.* /srv2/kubernetes/

On each minion...
mkdir -p /srv2/kubernetes
vi /srv2/kubernetes/ca.crt
vi /srv2/kubernetes/minion.key
vi /srv2/kubernetes/minion.crt

```
for NODE in $NODES; do
    openssl req -newkey rsa:2048 -nodes -keyout /srv/kubernetes/${NODE}.key -subj "/CN=${NODE}" -out /srv/kubernetes/${NODE}.csr
      openssl x509 -req -days 10000 -in /srv/kubernetes/${NODE}.csr -CA /srv/kubernetes/ca.crt -CAkey /srv/kubernetes/ca.key -CAcreateserial -out /srv/kubernetes/${NODE}.crt
  done
```
The minion files generate in the previous step need to be copied into each of your minions.  An easy way to do this is to just copy and paste the contents of the file into files on the minions.  If you want to mess with getting scp setup, feel free to do so.  These instructions will be for minion1, keep in mind you'll need to do this for minion2 as well.

First, create the directory to house the certificates...
```
mkdir /srv/kubernetes
```
From the master you need to populate these files from these files on the master...
```
master -> minion1
/srv/kubernetes/ca.crt -> /srv/kubernetes/ca.crt
/srv/kubernetes/minion1.key -> /srv/kubernetes/minion.key
/srv/kubernetes/minion1.crt -> /srv/kubernetes/minion.crt
```

Generate a kubeconfig file for each of your minions.  Your going to need the value of the TOKEN env variable you have on your master node, so `echo $TOKEN` on the master and make note of the value to use in the command below...
```
kubectl config set-cluster mykubecluster --server=https://master:6443 --insecure-skip-tls-verify=true
kubectl config unset clusters
kubectl config set-cluster mykubecluster --certificate-authority=/srv/kubernetes/ca.crt --embed-certs=true --server=https://master:6443
kubectl config set-credentials kubelet --client-certificate=/srv/kubernetes/minion1.crt --client-key=/srv/kubernetes/minion1.key --embed-certs=true --token=<THE TOKEN YOU GENERATED ON THE MASTER NODE>
kubectl config set-context service-account-context --cluster=mykubecluster --user=kubelet
kubectl config use-context service-account-context
```

These command will generate a kubeconfig file.  Take the content in the generated .kube/config file and put it on the node you configured it for...
```
cp /root/.kube/config /var/lib/kubelet/kubeconfig
```

Repeat these steps for minion2 and the master node, obviously replacing all references to 'minion1' with the correct machine you're configuring.

### Trust the CA
On the *HOST*, trust the ca certificate by running...
```
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /srv/kubernetes/ca.crt
```
On each *minion and master*, trust the ca certificate by running...
```
cp /srv/kubernetes/ca.crt /etc/pki/ca-trust/source/anchors
update-ca-trust enable
update-ca-trust extract
```

### Config files for kubernetes binaries

When you run the binary files you copied to the /usr/bin directory a couple of steps ago, they're going to read in variables from the files you're about to create now.  The first command will be what file to create and edit (using vi) followed by the text to place in the file.  

**MASTER and MINIONS**

`vi /etc/kubernetes/config`
~~~~
KUBE_LOGTOSTDERR="--logtostderr=true"
KUBE_LOG_LEVEL="--v=0"
KUBE_ALLOW_PRIV="--allow-privileged=true"
KUBE_MASTER="--master=https://master:6443"
KUBE_ETCD_SERVERS="--etcd-servers=http://master:2379"
~~~~

**MASTER and MINIONS**

`vi /etc/kubernetes/kubelet`
~~~~
KUBELET_ADDRESS="--address=0.0.0.0"
KUBELET_PORT="--port=10250"
KUBELET_HOSTNAME="--hostname-override=<MINION1 or MINION2>"
KUBELET_API_SERVER="--api-servers=https://master:6443"
##KUBELET_POD_INFRA_CONTAINER="--pod-infra-container-image=registry.access.redhat.com/rhel7/pod-infrastructure:latest"
KUBELET_KUBECONFIG=""
KUBELET_ARGS="--runtime-cgroups=/systemd/system.slice --kubelet-cgroups=/systemd/system.slice --cgroup-driver=systemd --fail-swap-on=false --enable_server=true --register-node=true --kubeconfig=/var/lib/kubelet/kubeconfig --node-status-update-frequency=5s"
~~~~

**MASTER**

`vi /etc/kubernetes/apiserver`
~~~~
KUBE_ETCD_SERVERS="--etcd-servers=http://127.0.0.1:2379"
KUBE_SERVICE_ADDRESSES="--service-cluster-ip-range=10.254.0.0/16"
KUBE_ADMISSION_CONTROL="--admission-control=NamespaceLifecycle,NamespaceExists,LimitRanger,ServiceAccount,ResourceQuota"
KUBE_API_ARGS="--insecure-bind-address=127.0.0.1 --kubelet-https=true --client-ca-file=/srv/kubernetes/ca.crt --tls-cert-file=/srv/kubernetes/server.crt --tls-private-key-file=/srv/kubernetes/server.key --token_auth_file=/srv/kube-apiserver/known_tokens.csv"
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://0.0.0.0:2379"
KUBE_API_ADDRESS=""
KUBE_API_PORT="--insecure-port=8080"
KUBELET_PORT="--kubelet-port=10250"
~~~~

**MASTER**

`vi /etc/kubernetes/controller-manager`
~~~~
KUBE_CONTROLLER_MANAGER_ARGS="--kubeconfig=/var/lib/kubelet/kubeconfig --root-ca-file=/srv/kubernetes/ca.crt --service-account-private-key-file=/srv/kubernetes/server.key --node-monitor-grace-period=20s --pod-eviction-timeout=20s"
~~~~

**MASTER**

`vi /etc/kubernetes/scheduler`
~~~~
KUBE_SCHEDULER_ARGS="--kubeconfig=/var/lib/kubelet/kubeconfig"
~~~~

**MINIONS**

`vi /etc/kubernetes/proxy`
~~~~
KUBE_PROXY_ARGS="--proxy-mode=userspace --kubeconfig=/var/lib/kubelet/kubeconfig"
~~~~

**MASTER**

`vi /etc/etcd/etcd.conf`
**ADD** these lines to the end of the file...
~~~~
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_ADVERTISE_CLIENT_URLS="http://0.0.0.0:2379"
ETCD_PEER_TRUSTED_CA_FILE="/srv/kubernetes/ca.crt"
ETCD_TRUSTED_CA_FILE="/srv/kubernetes/ca.crt"
~~~~

Create the service definitions for the kubernetes binaries that need to be run on the **MASTERS**...

`vi /usr/lib/systemd/system/kube-apiserver.service`
~~~~
[Unit]
Description=Kubernetes API Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target
After=etcd.service

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/apiserver
User= root
ExecStart=/usr/bin/kube-apiserver \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_ETCD_SERVERS \
           $KUBE_API_ADDRESS \
           $KUBE_API_PORT \
           $KUBELET_PORT \
           $KUBE_ALLOW_PRIV \
           $KUBE_SERVICE_ADDRESSES \
           $KUBE_ADMISSION_CONTROL \
           $KUBE_API_ARGS
Restart=on-failure
Type=notify
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

`vi /usr/lib/systemd/system/kube-controller-manager.service`
~~~~
[Unit]
Description=Kubernetes Controller Manager
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/controller-manager
User= root
ExecStart=/usr/bin/kube-controller-manager \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_MASTER \
           $KUBE_CONTROLLER_MANAGER_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

`vi /usr/lib/systemd/system/kube-scheduler.service`
~~~~
[Unit]
Description=Kubernetes Scheduler Plugin
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/scheduler
User=root
ExecStart=/usr/bin/kube-scheduler \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_MASTER \
           $KUBE_SCHEDULER_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

Create the service definitions for the kubernetes binaries that need to be run on the **MINIONS**...

`vi /usr/lib/systemd/system/kubelet.service`
~~~~
[Unit]
Description=Kubernetes Kubelet Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/var/lib/kubelet
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/kubelet
User=root
ExecStart=/usr/bin/kubelet \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBELET_KUBECONFIG \
           $KUBELET_ADDRESS \
           $KUBELET_PORT \
           $KUBELET_HOSTNAME \
           $KUBE_ALLOW_PRIV \
           $KUBELET_POD_INFRA_CONTAINER \
           $KUBELET_ARGS
Restart=on-failure

[Install]
WantedBy=multi-user.target
~~~~

`vi /usr/lib/systemd/system/kube-proxy.service`
~~~~
[Unit]
Description=Kubernetes Kube-Proxy Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target

[Service]
EnvironmentFile=-/etc/kubernetes/config
EnvironmentFile=-/etc/kubernetes/proxy
ExecStart=/usr/bin/kube-proxy \
           $KUBE_LOGTOSTDERR \
           $KUBE_LOG_LEVEL \
           $KUBE_MASTER \
           $KUBE_PROXY_ARGS
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
~~~~

Start everything up…
**MASTER**

```
systemctl enable etcd kube-apiserver kube-controller-manager kube-scheduler
systemctl start etcd kube-apiserver kube-controller-manager kube-scheduler
```
Check to make sure everything is running on the *Master*...

`systemctl status etcd kube-apiserver kube-controller-manager kube-scheduler | grep "(running)" | wc -l`
> 4

Further troubleshoot by running the following commands...
```
systemctl status etcd kube-apiserver kube-controller-manager kube-scheduler -l
journalctl -xe
```

Check to make sure everything is running on the *Minions*...

`systemctl status kube-proxy kubelet docker  | grep "(running)" | wc -l`
> 3

**MINIONS**

Start everything up...
```
systemctl enable kube-proxy kubelet docker
systemctl start kube-proxy kubelet docker
```

Further troubleshoot by running the following commands...
```
systemctl status kube-proxy kubelet docker -l
journalctl -xe
```

Check to make sure docker can pull down images and run them...
```
docker images
docker --version
docker pull hello-world
docker run hello-world
```
Check to see if security is working using the certificates...
```
curl -k --key /srv/kubernetes/minion.key  --cert /srv/kubernetes/minion.crt  --cacert /srv/kubernetes/ca.crt https://master:6443/version
```
Check to see if security is working using the token...
```
curl -k -H "Authorization: Bearer <TOKEN>" https://master:6443/version
```
Thanks to this [great guide](https://rootsquash.com/2016/05/10/securing-the-kubernetes-api/) on security setup.

# Running Containerized Applications

In order to test our cluster, we'll take a simple Node.js application, containerize it with Docker and deploy it to our cluster using kubectl.

If you cloned the git repository you'll have access to all the files this step requires.  The steps outlined below will take place on your **HOST** machine, not the VMs unless otherwise stated.

### Install Node and Docker

* Go to the [Node.js Downloads](https://nodejs.org/en/download/) page
* Download Node.js for macOS by clicking the "Macintosh Installer" option
* Run the downloaded Node.js .pkg Installer
* Run the installer, including accepting the license, selecting the destination, and authenticating for the install.
* You're finished! To ensure Node.js has been installed, run `node -v` in your terminal - you should get something like `v6.9.4`

The Docker install can be done from the command line on your host machine...

`yum install -y docker`

Run the same validation steps you performed in your VMs when you installed Docker on your minion machines...

```
docker images
docker --version
docker pull hello-world
docker run hello-world
```

### Run the Node application locally

```
cd ~/Documents/projects/serverless-on-kubernetes/sl-test
node server.js
```
To test the application, open a browser and go to http://localhost:8080/.  If you see "Hello World!"" in your browser, it's worked properly.  Back in the terminal where you ran the `node server.js` command press `<ctrl-c>` to terminate the application.

### Containerize the application

When you containerize this server.js application to be deployed to your cluster, the cluster is going to have to know where to get the container from.  There are a few ways of doing this, but an easy one is to create a local docker repository running on your machine to host the containers.  This will require a few additional setup steps, but it keeps the process entirely local to your machine.

#### Create a local Docker repository

```
docker run -d \
  -p 5000:5000 \
  --restart=always \
  --name registry \
  registry:2
curl http://127.0.0.1:5000/v2/_catalog
```
The result of the `curl` command should return something other than an error.  When you push an image to the repo, this command will report more information.

Now that you have a local Docker repository running, you need to tell the **MINION** VMs in your cluster how to communicate with it.

By now you should know how to get into the command line interface of each of your minions (`vagrant ssh`).  Access your minions and find the default gateway to talk to the host OS...

Starting on the host...

```
cd ~/Documents/serverless-on-kubernetes/minion1
vagrant ssh
sudo su
netstat -rn
```
~~~~
Destination     Gateway         Genmask         Flags   MSS Window  irtt Iface
0.0.0.0         10.0.2.2        0.0.0.0         UG        0 0          0 eth0
~~~~
Check to see you can access host OS local repository by running `curl http://10.0.2.2:5000/v2/_catalog`

In order for the minion to be able to pull the image from your host Docker repo, you need to tell Docker on the minions to allow for insecure connections to repositories.
`vi /etc/docker/daemon.json`
Add the following line...
~~~~
{ "insecure-registries":["docker.for.mac.localhost:5000","10.0.2.2:5000","local-docker-repo:5000"] }
~~~~
Restart docker daemon
`sudo service docker restart`
Now, alias the route back to the host by adding an entry to your minion’s /etc/hosts file...
`vi /etc/hosts`
Add the line...
~~~~
10.0.2.2        local-docker-repo
~~~~
Test the access to the host's Docker repo from the minion(s) by running `curl http://local-docker-repo:5000/v2/_catalog`

Repeat this process for the other minion node in your cluster.

#### Create the container for server.js

We'll use the Docker file in the sl-test directory to create the Docker container for server.js.  You can review the contents of that file by running `vi ~/Documents/projects/serverless/sl-test/Dockerfile`

The `docker` command being run in the following commands references the Docker file in the directory you're running the commands in.  So, be sure to run these commands from the sl-test directory.
```
cd ~/Documents/projects/serverless/sl-test/
docker build -t local-docker-repo:5000/sl-test .
docker tag local-docker-repo:5000/sl-test local-docker-repo:5000/sl-test:0.1
docker push local-docker-repo:5000/sl-test
```
Now, to test our containerized server.js application in our host before we deploy it to the Kubernetes cluster, run the following command...
```
docker run -p 8080:8080 sl-test
```
To test the application, open a browser and go to http://localhost:8080/.  If you see "Hello World!" in your browser, it's worked properly.  To exit the application, open another terminal window run `docker ps` and get the running container's **CONTAINER ID**.  Then run `docker kill <CONTAINER ID>`.

Log into your minion(s) to assure you can run the container from there.  Issue the following command to start the container in the background... `docker run -d -p 8080:8080 local-docker-repo:5000/sl-test`.  Test to assure you're seeing the "Hello World" message... `curl http://localhost:8080`.  If you see the message, go ahead and kill the container... `docker ps` (get the container id)... `docker kill <container id>`

#### Deploy the container to your Kubernetes cluster

Deploying the containerized application to your Kubernetes cluster can be done from the command line using the kubectl command line interface we installed a few steps back.  We'll create a Kubernets deployment and service definition in a yaml file to assist.  That yaml file is available to you if you cloned the repository and located at ~/Documents/projects/serverless/sl-test/k8.yml

For more information about the contents of this file, please see the Kubernetes documentation about [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) and [Services](https://kubernetes.io/docs/concepts/services-networking/service/).

Run the following commands to deploy your containerized server.js application to your local Kubernetes cluster...
```
cd ~/Documents/projects/serverless/sl-test/
kubectl create -f k8.yml
```

Test your deployment by navigating to http://<IP of your MINION>:31008/.  You should see the same "Hello World!" message you saw in the previous steps.

# Kubeless Installation and Configuration

Get the cluster IP and route those commands to the IP of your master host `kubectl get svc`
```
yum install net-tools
route add 10.254.0.1 gw 172.28.128.6
```

# Fission Installation and Configuration

Your host machine will require you install Helm, a Kubernetes package manager and installer.  On the host install the Helm command line interface...
```
cd /tmp
curl -LO https://storage.googleapis.com/kubernetes-helm/helm-v2.7.2-darwin-amd64.tar.gz
tar xzf helm-v2.7.2-darwin-amd64.tar.gz
mv darwin-amd64/helm /usr/local/bin
```
...next install Helm on your Kubernetes cluster...
```
kubectl -n kube-system create sa tiller
kubectl create clusterrolebinding tiller --clusterrole cluster-admin --serviceaccount=kube-system:tiller
helm init --service-account tiller
```
Helm needs a slight adjustment to make sure it can talk to your API server on your master node.  Run `kubectl get pods -n kube-system` to get the name of your running tiller pod.  You then need to set the KUBERNETES_MASTER environment variable so tiller knows where your API server is in you cluster.  Do this by getting the deployment yaml for the tiller pod, updating the contents to add the environment variable name and value, then applying the yaml to perform a rolling update of the pod.
```
kubectl get deployment tiller-deploy -n kube-system -o yaml > tiller-deploy.yaml
vi tiller-deploy.yaml
```
Alter the containers, env section to include a new KUBERNETES_MASTER section.  The value of the variable is the IP address and port to your API server running on your master node.  In the previous steps you had to set that value in your minions /etc/hosts files so you can get it from there if you forgot what that IP address is.
```
containers:
- env:
  - name: KUBERNETES_MASTER
    value: http://<IP ADDRESS OF MASTER NODE>:6443
  - name: TILLER_NAMESPACE
```    
Run `kubectl apply -f tiller-deploy.yaml --record` to apply the update to the environment variable.
Check to see that the new environment variable exists by running `kubectl exec tiller-deploy-<CUSTOM TO YOUR CLUSTER> -n kube-system env`


Access your two minion machines command line interface and install socat on each.  Socat is a relay for bidirectional data transfer between two independent data channels, as is required for Fission to run properly on your Kubernetes cluster.  Perform the following steps to install socat on each minion...
```
sudo su
cd /tmp
wget http://ftp.tu-chemnitz.de/pub/linux/dag/redhat/el6/en/x86_64/rpmforge/RPMS/socat-1.7.2.4-1.el6.rf.x86_64.rpm
rpm -Uvh socat-1.7.2.4-1.el6.rf.x86_64.rpm
yum install -y socat
```

Finally, we're ready to install Fission.
```
helm install --namespace fission --set serviceType=NodePort https://github.com/fission/fission/releases/download/0.3.0/fission-all-0.3.0.tgz
```
Install the Fission command line interface...
```
curl -Lo fission https://github.com/fission/fission/releases/download/0.3.0/fission-cli-osx && chmod +x fission && sudo mv fission /usr/local/bin/
```
export FISSION_URL=http://172.28.128.6:31313
export FISSION_ROUTER=172.28.128.6:31314
fission env create --name nodejs --image fission/node-env

# Kanali Installation and Configuration

Coming

# Running Serverless Functions

Coming
